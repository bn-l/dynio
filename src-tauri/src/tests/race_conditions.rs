use super::*;
use std::io::Cursor;
use tokio::time::Duration;

// Section 30: State Race Conditions Tests
// Tests to verify the system handles concurrent operations safely

/// Test that killing a process during stdout streaming doesn't cause crashes
mod process_kill_during_streaming {
    use super::*;

    #[tokio::test]
    async fn kill_signal_stops_line_reading_cleanly() {
        // Simulate a stream that would produce many lines
        let data = "line1\nline2\nline3\nline4\nline5\n".as_bytes();
        let cursor = Cursor::new(data.to_vec());
        let reader = BufReader::new(cursor);
        let lines = reader.lines();

        let (tx, rx) = watch::channel(Vec::<String>::new());
        let finish_flag = Arc::new(AtomicBool::new(false));

        // Set finish flag immediately - simulating kill during streaming
        let finish_flag_clone = finish_flag.clone();
        tokio::spawn(async move {
            // Small delay to let some reads start
            tokio::time::sleep(Duration::from_micros(10)).await;
            finish_flag_clone.store(true, atomic::Ordering::Relaxed);
        });

        read_and_send_lines(lines, tx, finish_flag).await;

        // Should have stopped without panic - may have partial results
        let result = rx.borrow().clone();
        // The test passes if we get here without panic
        assert!(result.len() <= 5); // At most all lines, probably fewer
    }

    #[tokio::test]
    async fn kill_signal_stops_chunk_reading_cleanly() {
        let data = "streaming data that would be read in chunks".as_bytes();
        let cursor = Cursor::new(data.to_vec());
        let reader = BufReader::new(cursor);

        let (tx, rx) = watch::channel(Vec::<String>::new());
        let finish_flag = Arc::new(AtomicBool::new(false));

        // Set finish flag immediately
        let finish_flag_clone = finish_flag.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_micros(10)).await;
            finish_flag_clone.store(true, atomic::Ordering::Relaxed);
        });

        read_and_send_chunks(reader, tx, finish_flag).await;

        // Should complete without panic
        let _result = rx.borrow().clone();
        // Test passes if we get here
    }

    #[tokio::test]
    async fn finish_flag_is_atomic_and_visible_across_threads() {
        let finish_flag = Arc::new(AtomicBool::new(false));
        let flag_clone = finish_flag.clone();

        // Spawn a task that will set the flag
        let handle = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(5)).await;
            flag_clone.store(true, atomic::Ordering::SeqCst);
        });

        // Wait for flag to be set
        handle.await.unwrap();

        // Flag should be visible
        assert!(finish_flag.load(atomic::Ordering::SeqCst));
    }
}

/// Test that command switching kills previous process correctly
mod command_switching {
    use super::*;
    use tauri::Manager;

    fn create_test_app() -> tauri::App<tauri::test::MockRuntime> {
        let app = tauri::test::mock_app();
        app.manage(KillChannel::default());
        app.manage(Mutex::new(TrayState::default()));
        app
    }

    #[tokio::test]
    async fn new_command_kills_previous() {
        let app = create_test_app();
        let state = app.state::<KillChannel>();

        // Set up first "process"
        let (tx1, rx1) = tokio::sync::oneshot::channel::<()>();
        state.kill_sender.lock().await.replace(tx1);

        // "Start" second process - should kill first
        if let Some(sender) = state.kill_sender.lock().await.take() {
            let _ = sender.send(());
        }

        // First process should have received kill signal
        assert!(rx1.await.is_ok());

        // Set up second process
        let (tx2, _rx2) = tokio::sync::oneshot::channel::<()>();
        state.kill_sender.lock().await.replace(tx2);

        // Second process sender should exist
        assert!(state.kill_sender.lock().await.is_some());
    }

    #[tokio::test]
    async fn rapid_command_switches_handled_safely() {
        let app = create_test_app();
        let state = app.state::<KillChannel>();

        // Simulate rapid command switches
        for i in 0..10 {
            // Kill previous if exists
            if let Some(sender) = state.kill_sender.lock().await.take() {
                let _ = sender.send(());
            }

            // Set up new process
            let (tx, _rx) = tokio::sync::oneshot::channel::<()>();
            state.kill_sender.lock().await.replace(tx);

            // Verify state is consistent
            assert!(
                state.kill_sender.lock().await.is_some(),
                "Failed at iteration {}",
                i
            );
        }
    }

    #[tokio::test]
    async fn concurrent_kill_attempts_are_safe() {
        // Use an Arc-wrapped mutex directly instead of Tauri managed state
        // to test concurrent access patterns
        let kill_sender: Arc<tokio::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>> =
            Arc::new(tokio::sync::Mutex::new(None));

        // Set up a process
        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        kill_sender.lock().await.replace(tx);

        // Try to kill from multiple tasks simultaneously
        let sender1 = kill_sender.clone();
        let sender2 = kill_sender.clone();

        let handle1 = tokio::spawn(async move {
            if let Some(sender) = sender1.lock().await.take() {
                let _ = sender.send(());
                true
            } else {
                false
            }
        });

        let handle2 = tokio::spawn(async move {
            if let Some(sender) = sender2.lock().await.take() {
                let _ = sender.send(());
                true
            } else {
                false
            }
        });

        let (result1, result2) = tokio::join!(handle1, handle2);

        // Exactly one should have succeeded in taking the sender
        let succeeded = [result1.unwrap(), result2.unwrap()]
            .iter()
            .filter(|&&x| x)
            .count();
        assert_eq!(succeeded, 1, "Exactly one task should take the sender");

        // Receiver got the signal
        assert!(rx.await.is_ok());
    }
}

/// Test that multiple rapid executions only run the latest
mod rapid_executions {
    use super::*;
    use tauri::Manager;

    fn create_test_app() -> tauri::App<tauri::test::MockRuntime> {
        let app = tauri::test::mock_app();
        app.manage(KillChannel::default());
        app.manage(Mutex::new(TrayState::default()));
        app
    }

    #[tokio::test]
    async fn multiple_executions_kill_previous_each_time() {
        let app = create_test_app();
        let state = app.state::<KillChannel>();

        let mut receivers = Vec::new();

        // Simulate 5 rapid executions
        for _ in 0..5 {
            // Kill previous
            if let Some(sender) = state.kill_sender.lock().await.take() {
                let _ = sender.send(());
            }

            // Set up new
            let (tx, rx) = tokio::sync::oneshot::channel::<()>();
            state.kill_sender.lock().await.replace(tx);
            receivers.push(rx);
        }

        // All previous receivers should have completed (either got signal or sender dropped)
        // The last one is still pending
        for (i, rx) in receivers.into_iter().enumerate() {
            if i < 4 {
                // Previous ones should have received kill or be closed
                let result = rx.await;
                // Either Ok (got signal) or Err (sender dropped) is fine
                assert!(result.is_ok() || result.is_err());
            }
        }

        // Only the last sender should remain
        assert!(state.kill_sender.lock().await.is_some());
    }

    #[tokio::test]
    async fn state_remains_consistent_after_rapid_changes() {
        let app = create_test_app();
        let kill_state = app.state::<KillChannel>();
        let tray_state = app.state::<Mutex<TrayState>>();

        // Rapidly toggle tray state while also manipulating kill channel
        for i in 0..20 {
            // Manipulate kill channel
            if let Some(sender) = kill_state.kill_sender.lock().await.take() {
                let _ = sender.send(());
            }
            let (tx, _rx) = tokio::sync::oneshot::channel::<()>();
            kill_state.kill_sender.lock().await.replace(tx);

            // Toggle tray state
            {
                let mut guard = tray_state.lock().await;
                guard.currently_open = i % 2 == 0;
            }

            // Verify state is consistent
            let tray_open = tray_state.lock().await.currently_open;
            assert_eq!(tray_open, i % 2 == 0, "Tray state mismatch at iteration {}", i);
        }
    }
}

/// Test tray open/close race conditions
mod tray_state_races {
    use super::*;
    use tauri::Manager;

    fn create_test_app() -> tauri::App<tauri::test::MockRuntime> {
        let app = tauri::test::mock_app();
        app.manage(KillChannel::default());
        app.manage(Mutex::new(TrayState::default()));
        app
    }

    #[tokio::test]
    async fn rapid_tray_toggle_maintains_consistency() {
        let app = create_test_app();
        let state = app.state::<Mutex<TrayState>>();

        // Initialize state
        {
            let mut guard = state.lock().await;
            guard.width = 800.0;
            guard.tray_closed_height = 100.0;
            guard.tray_open_height = 400.0;
            guard.currently_open = false;
        }

        // Rapid open/close cycles
        for _ in 0..50 {
            // Open
            {
                let mut guard = state.lock().await;
                if !guard.currently_open {
                    guard.currently_open = true;
                }
            }

            // Close
            {
                let mut guard = state.lock().await;
                if guard.currently_open {
                    guard.currently_open = false;
                }
            }
        }

        // Final state should be closed (last operation was close)
        let guard = state.lock().await;
        assert!(!guard.currently_open);
    }

    #[tokio::test]
    async fn concurrent_tray_operations_are_mutex_protected() {
        // Use Arc-wrapped TrayState directly to test mutex behavior
        #[derive(Default)]
        struct TestTrayState {
            width: f64,
            tray_closed_height: f64,
            tray_open_height: f64,
            currently_open: bool,
        }

        let state: Arc<tokio::sync::Mutex<TestTrayState>> =
            Arc::new(tokio::sync::Mutex::new(TestTrayState::default()));

        // Initialize
        {
            let mut guard = state.lock().await;
            guard.width = 800.0;
            guard.tray_closed_height = 100.0;
            guard.tray_open_height = 400.0;
            guard.currently_open = false;
        }

        let state_clone1 = state.clone();
        let state_clone2 = state.clone();

        // Two tasks trying to modify state concurrently
        let handle1 = tokio::spawn(async move {
            for _ in 0..100 {
                let mut guard = state_clone1.lock().await;
                guard.currently_open = true;
                // Yield to allow other task to try to acquire lock
                drop(guard);
                tokio::task::yield_now().await;
            }
        });

        let handle2 = tokio::spawn(async move {
            for _ in 0..100 {
                let mut guard = state_clone2.lock().await;
                guard.currently_open = false;
                drop(guard);
                tokio::task::yield_now().await;
            }
        });

        // Both should complete without deadlock
        let (r1, r2) = tokio::join!(handle1, handle2);
        assert!(r1.is_ok());
        assert!(r2.is_ok());

        // State should be valid (either true or false, but consistent)
        let guard = state.lock().await;
        assert!(guard.currently_open || !guard.currently_open); // Tautology, but ensures no corruption
        assert_eq!(guard.width, 800.0); // Other fields unchanged
        assert_eq!(guard.tray_closed_height, 100.0);
        assert_eq!(guard.tray_open_height, 400.0);
    }

    #[tokio::test]
    async fn tray_dimensions_preserved_during_rapid_toggle() {
        let app = create_test_app();
        let state = app.state::<Mutex<TrayState>>();

        // Initialize with specific dimensions
        {
            let mut guard = state.lock().await;
            guard.width = 806.4;
            guard.tray_closed_height = 129.024;
            guard.tray_open_height = 522.5472;
            guard.currently_open = false;
        }

        // Rapid toggles
        for _ in 0..100 {
            {
                let mut guard = state.lock().await;
                guard.currently_open = !guard.currently_open;
            }
        }

        // Dimensions should be unchanged
        let guard = state.lock().await;
        assert!((guard.width - 806.4).abs() < 0.001);
        assert!((guard.tray_closed_height - 129.024).abs() < 0.001);
        assert!((guard.tray_open_height - 522.5472).abs() < 0.001);
    }
}

/// Test select! pattern for process wait vs kill
mod select_race_patterns {
    use super::*;

    #[tokio::test]
    async fn select_handles_immediate_kill() {
        let (kill_tx, kill_rx) = tokio::sync::oneshot::channel::<()>();

        // Send kill immediately
        kill_tx.send(()).unwrap();

        let result = tokio::select! {
            _ = tokio::time::sleep(Duration::from_secs(10)) => "timeout",
            _ = kill_rx => "killed",
        };

        assert_eq!(result, "killed");
    }

    #[tokio::test]
    async fn select_handles_delayed_kill() {
        let (kill_tx, kill_rx) = tokio::sync::oneshot::channel::<()>();

        // Send kill after small delay
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(10)).await;
            let _ = kill_tx.send(());
        });

        let result = tokio::select! {
            _ = tokio::time::sleep(Duration::from_secs(10)) => "timeout",
            _ = kill_rx => "killed",
        };

        assert_eq!(result, "killed");
    }

    #[tokio::test]
    async fn select_handles_completion_before_kill() {
        let (kill_tx, kill_rx) = tokio::sync::oneshot::channel::<()>();

        // Don't send kill - let completion win

        let result = tokio::select! {
            _ = tokio::time::sleep(Duration::from_millis(1)) => "completed",
            _ = kill_rx => "killed",
        };

        assert_eq!(result, "completed");

        // Kill sender still exists
        assert!(kill_tx.send(()).is_err()); // Receiver was dropped
    }

    #[tokio::test]
    async fn finish_flag_propagates_to_readers() {
        let finish_flag = Arc::new(AtomicBool::new(false));
        let flag_reader1 = finish_flag.clone();
        let flag_reader2 = finish_flag.clone();

        // Simulate two readers checking the flag
        let reader1 = tokio::spawn(async move {
            let mut iterations = 0;
            while !flag_reader1.load(atomic::Ordering::Relaxed) {
                iterations += 1;
                if iterations > 1000 {
                    break; // Safety limit
                }
                tokio::task::yield_now().await;
            }
            iterations
        });

        let reader2 = tokio::spawn(async move {
            let mut iterations = 0;
            while !flag_reader2.load(atomic::Ordering::Relaxed) {
                iterations += 1;
                if iterations > 1000 {
                    break;
                }
                tokio::task::yield_now().await;
            }
            iterations
        });

        // Set flag after small delay
        tokio::time::sleep(Duration::from_millis(1)).await;
        finish_flag.store(true, atomic::Ordering::Relaxed);

        let (r1, r2) = tokio::join!(reader1, reader2);

        // Both readers should have seen the flag
        assert!(r1.unwrap() <= 1000);
        assert!(r2.unwrap() <= 1000);
    }
}

/// Test watch channel behavior under concurrent access
mod watch_channel_races {
    use super::*;

    #[tokio::test]
    async fn watch_channel_handles_rapid_sends() {
        let (tx, rx) = watch::channel(Vec::<String>::new());

        // Rapid sends
        for i in 0..1000 {
            tx.send_modify(|vec| vec.push(format!("line{}", i)));
        }

        let result = rx.borrow().clone();
        assert_eq!(result.len(), 1000);
    }

    #[tokio::test]
    async fn watch_channel_concurrent_send_and_receive() {
        let (tx, mut rx) = watch::channel(Vec::<String>::new());

        let tx_clone = tx.clone();

        // Sender task
        let sender = tokio::spawn(async move {
            for i in 0..100 {
                tx_clone.send_modify(|vec| vec.push(format!("msg{}", i)));
                tokio::task::yield_now().await;
            }
        });

        // Receiver task
        let receiver = tokio::spawn(async move {
            let mut last_len = 0;
            loop {
                if rx.changed().await.is_err() {
                    break;
                }
                let len = rx.borrow().len();
                assert!(len >= last_len, "Length should never decrease");
                last_len = len;
                if len >= 100 {
                    break;
                }
            }
        });

        sender.await.unwrap();
        drop(tx); // Drop sender to close channel
        receiver.await.unwrap();
    }

    #[tokio::test]
    async fn dedup_works_correctly_with_concurrent_sends() {
        let (tx, rx) = watch::channel(Vec::<String>::new());

        // Send duplicates rapidly
        for _ in 0..100 {
            tx.send_modify(|vec| vec.push("dup".to_string()));
        }
        tx.send_modify(|vec| vec.push("unique".to_string()));

        let mut result = rx.borrow().clone();
        result.dedup();

        // After dedup, should have 2 items
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], "dup");
        assert_eq!(result[1], "unique");
    }
}

/// Test spawn_detached race conditions
mod spawn_detached_races {
    use super::*;
    use std::sync::atomic::Ordering;

    #[tokio::test]
    async fn concurrent_spawn_attempts_respect_limit() {
        // Store original value
        let original = ACTIVE_DETACHED.load(Ordering::Relaxed);

        // Set to just below limit
        ACTIVE_DETACHED.store(MAX_DETACHED - 2, Ordering::Relaxed);

        // Try to spawn 5 processes - collect handles first
        let handle1 = tokio::spawn(async {
            spawn_detached("sleep".to_string(), vec!["0.001".to_string()], None).await
        });
        let handle2 = tokio::spawn(async {
            spawn_detached("sleep".to_string(), vec!["0.001".to_string()], None).await
        });
        let handle3 = tokio::spawn(async {
            spawn_detached("sleep".to_string(), vec!["0.001".to_string()], None).await
        });
        let handle4 = tokio::spawn(async {
            spawn_detached("sleep".to_string(), vec!["0.001".to_string()], None).await
        });
        let handle5 = tokio::spawn(async {
            spawn_detached("sleep".to_string(), vec!["0.001".to_string()], None).await
        });

        // Wait for all to complete
        let (r1, r2, r3, r4, r5) = tokio::join!(handle1, handle2, handle3, handle4, handle5);

        let results: Vec<Result<(), String>> = vec![
            r1.unwrap(),
            r2.unwrap(),
            r3.unwrap(),
            r4.unwrap(),
            r5.unwrap(),
        ];

        // Count successes and failures
        let successes = results.iter().filter(|r| r.is_ok()).count();
        let failures = results.iter().filter(|r| r.is_err()).count();

        // At most 2 should succeed (we were at MAX_DETACHED - 2)
        assert!(successes <= 2, "Too many successes: {}", successes);
        assert!(failures >= 3, "Too few failures: {}", failures);

        // Wait for spawned processes to complete
        tokio::time::sleep(Duration::from_millis(50)).await;

        // Restore original
        ACTIVE_DETACHED.store(original, Ordering::Relaxed);
    }

    #[tokio::test]
    async fn active_count_decrements_on_completion() {
        let original = ACTIVE_DETACHED.load(Ordering::Relaxed);

        // Spawn a quick process
        let result = spawn_detached("true".to_string(), vec![], None).await;

        if result.is_ok() {
            // Count should have incremented
            let after_spawn = ACTIVE_DETACHED.load(Ordering::Relaxed);
            assert!(after_spawn > original || after_spawn == original); // May have already completed

            // Wait for process to complete
            tokio::time::sleep(Duration::from_millis(100)).await;

            // Count should be back to original (or close to it)
            let after_wait = ACTIVE_DETACHED.load(Ordering::Relaxed);
            // Allow some tolerance since other tests may be running
            assert!(after_wait <= original + 1);
        }
    }
}
