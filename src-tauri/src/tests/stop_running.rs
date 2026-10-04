use super::*;
use tokio::sync::oneshot;

#[tokio::test]
async fn kill_channel_default_has_no_sender() {
    let channel = KillChannel::default();
    let sender = channel.kill_sender.lock().await.take();
    assert!(sender.is_none());
}

#[tokio::test]
async fn kill_channel_can_store_and_retrieve_sender() {
    let channel = KillChannel::default();
    let (tx, _rx) = oneshot::channel::<()>();

    channel.kill_sender.lock().await.replace(tx);

    let sender = channel.kill_sender.lock().await.take();
    assert!(sender.is_some());
}

#[tokio::test]
async fn kill_channel_sender_fires_when_sent() {
    let channel = KillChannel::default();
    let (tx, rx) = oneshot::channel::<()>();

    channel.kill_sender.lock().await.replace(tx);

    // Take and send
    if let Some(sender) = channel.kill_sender.lock().await.take() {
        let _ = sender.send(());
    }

    // Receiver should get the signal
    let result = rx.await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn kill_channel_take_twice_returns_none() {
    let channel = KillChannel::default();
    let (tx, _rx) = oneshot::channel::<()>();

    channel.kill_sender.lock().await.replace(tx);

    // First take succeeds
    let first = channel.kill_sender.lock().await.take();
    assert!(first.is_some());

    // Second take returns None
    let second = channel.kill_sender.lock().await.take();
    assert!(second.is_none());
}

/// Stopping real commands. run_program puts each command in its own process group, and
/// stopping it signals the whole group: SIGTERM first, then SIGKILL after a grace period.
#[cfg(any(target_os = "linux", target_os = "macos"))]
mod process_group {
    use super::*;
    use nix::sys::signal::{kill, Signal};
    use nix::unistd::Pid;
    use std::os::unix::process::ExitStatusExt;
    use tauri::Manager;
    use tokio::time::{sleep, timeout, Instant};

    fn create_test_app() -> tauri::App<tauri::test::MockRuntime> {
        let app = tauri::test::mock_app();
        app.manage(KillChannel::default());
        app
    }

    /// Runs a shell script the way dynio runs a command
    fn run_script(
        app: &tauri::App<tauri::test::MockRuntime>,
        script: String,
    ) -> tokio::task::JoinHandle<Result<(), SerError>> {
        let args = vec!["-c".to_string(), script];
        tokio::spawn(run_program(
            "sh".into(),
            None,
            args,
            String::new(),
            None,
            app.handle().clone(),
        ))
    }

    /// Waits for a test script to finish writing a line to `path` and returns it trimmed. The
    /// scripts do this once they've started everything the test needs.
    async fn read_when_written(path: &std::path::Path) -> String {
        timeout(Duration::from_secs(5), async {
            loop {
                if let Ok(text) = std::fs::read_to_string(path) {
                    if text.ends_with('\n') {
                        return text.trim().to_string();
                    }
                }
                sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .expect("the script didn't write its file in time")
    }

    /// Waits until run_program has stored the way to stop the command. The script can be
    /// running a moment before that, and stop_running does nothing without it.
    async fn wait_until_stoppable(app: &tauri::App<tauri::test::MockRuntime>) {
        let state = app.state::<KillChannel>();
        timeout(Duration::from_secs(5), async {
            while state.kill_sender.lock().await.is_none() {
                sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("run_program never stored a kill sender");
    }

    #[tokio::test]
    async fn stop_running_also_stops_what_the_command_started() {
        let app = create_test_app();
        let dir = tempfile::tempdir().unwrap();
        let pid_file = dir.path().join("pid");
        let run = run_script(
            &app,
            format!("sleep 30 & echo $! > '{}'; wait", pid_file.display()),
        );
        let sleep_pid = Pid::from_raw(read_when_written(&pid_file).await.parse().unwrap());
        wait_until_stoppable(&app).await;

        stop_running(app.handle().clone()).await;
        run.await.unwrap().unwrap();

        // Once its parent is gone the dead sleep is cleared away by the system, so poll
        let gone = timeout(Duration::from_secs(2), async {
            while kill(sleep_pid, None).is_ok() {
                sleep(Duration::from_millis(20)).await;
            }
        })
        .await;
        assert!(
            gone.is_ok(),
            "the sleep the script started is still running"
        );
    }

    #[tokio::test]
    async fn stopped_command_can_clean_up_with_a_trap() {
        let app = create_test_app();
        let dir = tempfile::tempdir().unwrap();
        let (ready, cleaned) = (dir.path().join("ready"), dir.path().join("cleaned"));
        let run = run_script(
            &app,
            format!(
                "trap 'echo yes > \"{}\"; exit' TERM; echo > \"{}\"; sleep 30 & wait",
                cleaned.display(),
                ready.display()
            ),
        );
        read_when_written(&ready).await;
        wait_until_stoppable(&app).await;

        stop_running(app.handle().clone()).await;
        run.await.unwrap().unwrap();

        assert_eq!(std::fs::read_to_string(&cleaned).unwrap(), "yes\n");
    }

    #[tokio::test]
    async fn stop_kills_a_command_that_ignores_sigterm_after_the_grace_period() {
        let grace = Duration::from_millis(300);
        let mut child = tokio::process::Command::new("sh")
            .args(["-c", "trap '' TERM; echo ready; sleep 30"])
            .process_group(0)
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let mut lines = BufReader::new(child.stdout.take().unwrap()).lines();
        assert_eq!(lines.next_line().await.unwrap().as_deref(), Some("ready"));

        let started = Instant::now();
        stop_child(&mut child, grace).await;

        assert!(
            started.elapsed() >= grace,
            "it was killed before the grace period was up"
        );
        let status = child.wait().await.unwrap();
        assert_eq!(status.signal(), Some(Signal::SIGKILL as i32));
    }

    #[tokio::test]
    async fn stopping_a_command_that_already_exited_returns_at_once() {
        let mut child = tokio::process::Command::new("true")
            .process_group(0)
            .spawn()
            .unwrap();
        // Exited but not waited for yet: macOS refuses to signal its group then (EPERM)
        sleep(Duration::from_millis(200)).await;

        let started = Instant::now();
        stop_child(&mut child, Duration::from_secs(5)).await;

        assert!(
            started.elapsed() < Duration::from_secs(1),
            "it waited out the grace period"
        );
        assert!(child.wait().await.unwrap().success());
    }
}
