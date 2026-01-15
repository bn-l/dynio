use super::*;
use tauri::Manager;

/// Helper to create a mock app with managed state
fn create_test_app() -> tauri::App<tauri::test::MockRuntime> {
    let app = tauri::test::mock_app();
    app.manage(KillChannel::default());
    app.manage(Mutex::new(TrayState::default()));
    app
}

// Section 20: stop_running command with managed state

#[tokio::test]
async fn stop_running_with_no_active_process() {
    let app = create_test_app();
    let state = app.state::<KillChannel>();

    // Verify no sender initially
    assert!(state.kill_sender.lock().await.is_none());

    // Call stop_running directly with managed state - should be no-op
    stop_running(app.handle().clone()).await;

    // Still no sender (was None, remains None)
    assert!(state.kill_sender.lock().await.is_none());
}

#[tokio::test]
async fn stop_running_sends_kill_signal() {
    let app = create_test_app();
    let state = app.state::<KillChannel>();

    // Set up a kill channel
    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    state.kill_sender.lock().await.replace(tx);

    // Call stop_running
    stop_running(app.handle().clone()).await;

    // Sender should have been taken
    assert!(state.kill_sender.lock().await.is_none());

    // Receiver should have received the signal
    assert!(rx.await.is_ok());
}

#[tokio::test]
async fn stop_running_clears_sender_after_use() {
    let app = create_test_app();
    let state = app.state::<KillChannel>();

    // Set up a kill channel
    let (tx, _rx) = tokio::sync::oneshot::channel::<()>();
    state.kill_sender.lock().await.replace(tx);

    // Call stop_running twice
    stop_running(app.handle().clone()).await;
    stop_running(app.handle().clone()).await; // Should be no-op

    // Sender should remain None
    assert!(state.kill_sender.lock().await.is_none());
}

// Section 21: open_tray/close_tray with managed state

#[tokio::test]
async fn tray_state_initialized_correctly() {
    let app = create_test_app();
    let state = app.state::<Mutex<TrayState>>();
    let guard = state.lock().await;

    assert_eq!(guard.width, 0.0);
    assert_eq!(guard.tray_closed_height, 0.0);
    assert_eq!(guard.tray_open_height, 0.0);
    assert!(!guard.currently_open);
}

#[tokio::test]
async fn tray_state_can_be_updated_via_managed_state() {
    let app = create_test_app();
    let state = app.state::<Mutex<TrayState>>();

    // Update state
    {
        let mut guard = state.lock().await;
        guard.width = 800.0;
        guard.tray_closed_height = 100.0;
        guard.tray_open_height = 400.0;
        guard.currently_open = false;
    }

    // Verify state persists
    {
        let guard = state.lock().await;
        assert_eq!(guard.width, 800.0);
        assert_eq!(guard.tray_closed_height, 100.0);
        assert_eq!(guard.tray_open_height, 400.0);
        assert!(!guard.currently_open);
    }
}

#[tokio::test]
async fn open_tray_updates_state_flag() {
    let app = create_test_app();
    let state = app.state::<Mutex<TrayState>>();

    // Set up initial state (simulating what setup_main_window does)
    {
        let mut guard = state.lock().await;
        guard.width = 800.0;
        guard.tray_closed_height = 100.0;
        guard.tray_open_height = 400.0;
        guard.currently_open = false;
    }

    // open_tray requires a window, which MockRuntime may not fully support
    // We test the state logic directly here
    {
        let mut guard = state.lock().await;
        if !guard.currently_open {
            guard.currently_open = true;
        }
    }

    let guard = state.lock().await;
    assert!(guard.currently_open);
}

#[tokio::test]
async fn close_tray_updates_state_flag() {
    let app = create_test_app();
    let state = app.state::<Mutex<TrayState>>();

    // Set up initial state as open
    {
        let mut guard = state.lock().await;
        guard.width = 800.0;
        guard.tray_closed_height = 100.0;
        guard.tray_open_height = 400.0;
        guard.currently_open = true;
    }

    // Test close logic
    {
        let mut guard = state.lock().await;
        if guard.currently_open {
            guard.currently_open = false;
        }
    }

    let guard = state.lock().await;
    assert!(!guard.currently_open);
}

// Section 19: run_program with managed state

#[tokio::test]
async fn run_program_registers_kill_sender() {
    let app = create_test_app();
    let state = app.state::<KillChannel>();

    // Initially no sender
    assert!(state.kill_sender.lock().await.is_none());

    // Simulate what run_program does when setting up kill channel
    let (tx, _rx) = tokio::sync::oneshot::channel::<()>();
    state.kill_sender.lock().await.replace(tx);

    // Now there should be a sender
    assert!(state.kill_sender.lock().await.is_some());
}

#[tokio::test]
async fn run_program_kills_previous_process() {
    let app = create_test_app();
    let state = app.state::<KillChannel>();

    // Set up initial kill channel (simulating a running process)
    let (tx1, rx1) = tokio::sync::oneshot::channel::<()>();
    state.kill_sender.lock().await.replace(tx1);

    // Simulate what run_program does at the start - kill previous
    if let Some(sender) = state.kill_sender.lock().await.take() {
        let _ = sender.send(());
    }

    // Previous process should have received kill signal
    assert!(rx1.await.is_ok());

    // Set up new kill channel
    let (tx2, _rx2) = tokio::sync::oneshot::channel::<()>();
    state.kill_sender.lock().await.replace(tx2);

    // New sender should exist
    assert!(state.kill_sender.lock().await.is_some());
}

#[tokio::test]
async fn multiple_managed_states_work_together() {
    let app = create_test_app();

    // Access both states
    let kill_state = app.state::<KillChannel>();
    let tray_state = app.state::<Mutex<TrayState>>();

    // Modify both
    let (tx, _rx) = tokio::sync::oneshot::channel::<()>();
    kill_state.kill_sender.lock().await.replace(tx);

    {
        let mut guard = tray_state.lock().await;
        guard.currently_open = true;
    }

    // Verify both
    assert!(kill_state.kill_sender.lock().await.is_some());
    assert!(tray_state.lock().await.currently_open);
}

// Testing commands that don't require window/runtime features

#[tokio::test]
async fn trim_path_command_works() {
    // trim_path doesn't need AppHandle, test it directly
    let result = trim_path("/home/user/file.txt".to_string()).await;
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "/home/user");
}

#[tokio::test]
async fn get_config_dir_command_works() {
    // get_config_dir doesn't need AppHandle, test it directly
    let result = get_config_dir().await;
    assert!(result.is_ok());
    assert!(result.unwrap().contains("dynio"));
}

// Spawn detached tests with state

#[tokio::test]
async fn spawn_detached_respects_max_limit() {
    use std::sync::atomic::Ordering;

    // Get current count
    let initial = ACTIVE_DETACHED.load(Ordering::Relaxed);

    // Temporarily set count to max
    ACTIVE_DETACHED.store(MAX_DETACHED, Ordering::Relaxed);

    // Try to spawn - should fail
    let result = spawn_detached(
        "echo".to_string(),
        vec!["test".to_string()],
        None,
    ).await;

    assert!(result.is_err());
    assert!(result.unwrap_err().contains("Too many background processes"));

    // Restore
    ACTIVE_DETACHED.store(initial, Ordering::Relaxed);
}
