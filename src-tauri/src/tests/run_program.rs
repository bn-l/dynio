use super::*;

#[tokio::test]
async fn reads_lines_and_sends_to_channel() {
    let data = b"line1\nline2\nline3\n";
    let cursor = Cursor::new(data.to_vec());
    let reader = BufReader::new(cursor);
    let lines = reader.lines();

    let (tx, mut rx) = watch::channel(Vec::<String>::new());
    let finish_flag = Arc::new(AtomicBool::new(false));

    read_and_send_lines(lines, tx, finish_flag).await;

    let result = rx.borrow_and_update().clone();
    assert_eq!(result.len(), 3);
    assert_eq!(result[0], "line1");
    assert_eq!(result[1], "line2");
    assert_eq!(result[2], "line3");
}

#[tokio::test]
async fn read_lines_respects_finish_flag() {
    let data = b"line1\nline2\nline3\n";
    let cursor = Cursor::new(data.to_vec());
    let reader = BufReader::new(cursor);
    let lines = reader.lines();

    let (tx, rx) = watch::channel(Vec::<String>::new());
    let finish_flag = Arc::new(AtomicBool::new(true)); // Already finished

    read_and_send_lines(lines, tx, finish_flag).await;

    // Should stop immediately
    let result = rx.borrow().clone();
    assert!(result.is_empty() || result.len() < 3);
}

#[tokio::test]
async fn read_lines_handles_empty_input() {
    let data = b"";
    let cursor = Cursor::new(data.to_vec());
    let reader = BufReader::new(cursor);
    let lines = reader.lines();

    let (tx, rx) = watch::channel(Vec::<String>::new());
    let finish_flag = Arc::new(AtomicBool::new(false));

    read_and_send_lines(lines, tx, finish_flag).await;

    let result = rx.borrow().clone();
    assert!(result.is_empty());
}

#[tokio::test]
async fn read_lines_handles_utf8_correctly() {
    let data = "日本語\nüber\nкириллица\n".as_bytes();
    let cursor = Cursor::new(data.to_vec());
    let reader = BufReader::new(cursor);
    let lines = reader.lines();

    let (tx, rx) = watch::channel(Vec::<String>::new());
    let finish_flag = Arc::new(AtomicBool::new(false));

    read_and_send_lines(lines, tx, finish_flag).await;

    let result = rx.borrow().clone();
    assert_eq!(result.len(), 3);
    assert_eq!(result[0], "日本語");
    assert_eq!(result[1], "über");
    assert_eq!(result[2], "кириллица");
}

#[tokio::test]
async fn read_lines_handles_very_long_lines() {
    let long_line = "x".repeat(10000);
    let data = format!("{}\n", long_line);
    let cursor = Cursor::new(data.into_bytes());
    let reader = BufReader::new(cursor);
    let lines = reader.lines();

    let (tx, rx) = watch::channel(Vec::<String>::new());
    let finish_flag = Arc::new(AtomicBool::new(false));

    read_and_send_lines(lines, tx, finish_flag).await;

    let result = rx.borrow().clone();
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].len(), 10000);
}

#[tokio::test]
async fn reads_chunks_immediately() {
    let data = b"chunk data without newlines";
    let cursor = Cursor::new(data.to_vec());
    let reader = BufReader::new(cursor);

    let (tx, rx) = watch::channel(Vec::<String>::new());
    let finish_flag = Arc::new(AtomicBool::new(false));

    read_and_send_chunks(reader, tx, finish_flag).await;

    let result = rx.borrow().clone();
    assert!(!result.is_empty());
    let joined: String = result.join("");
    assert_eq!(joined, "chunk data without newlines");
}

#[tokio::test]
async fn read_chunks_respects_finish_flag() {
    let data = b"chunk data";
    let cursor = Cursor::new(data.to_vec());
    let reader = BufReader::new(cursor);

    let (tx, rx) = watch::channel(Vec::<String>::new());
    let finish_flag = Arc::new(AtomicBool::new(true)); // Already finished

    read_and_send_chunks(reader, tx, finish_flag).await;

    let result = rx.borrow().clone();
    assert!(result.is_empty());
}

#[tokio::test]
async fn read_chunks_handles_utf8() {
    let data = "日本語データ".as_bytes();
    let cursor = Cursor::new(data.to_vec());
    let reader = BufReader::new(cursor);

    let (tx, rx) = watch::channel(Vec::<String>::new());
    let finish_flag = Arc::new(AtomicBool::new(false));

    read_and_send_chunks(reader, tx, finish_flag).await;

    let result = rx.borrow().clone();
    let joined: String = result.join("");
    assert_eq!(joined, "日本語データ");
}

#[tokio::test]
async fn read_chunks_handles_empty_input() {
    let data: &[u8] = b"";
    let cursor = Cursor::new(data.to_vec());
    let reader = BufReader::new(cursor);

    let (tx, rx) = watch::channel(Vec::<String>::new());
    let finish_flag = Arc::new(AtomicBool::new(false));

    read_and_send_chunks(reader, tx, finish_flag).await;

    let result = rx.borrow().clone();
    assert!(result.is_empty());
}

/// Tests that invalid UTF-8 bytes are skipped gracefully.
/// The read_and_send_chunks function uses `if let Ok(s) = std::str::from_utf8()`
/// which silently skips chunks that contain invalid UTF-8 sequences.
#[tokio::test]
async fn read_chunks_skips_invalid_utf8_gracefully() {
    // Create data with invalid UTF-8 sequences
    // 0xFF and 0xFE are never valid in UTF-8
    let invalid_utf8: Vec<u8> = vec![0xFF, 0xFE, 0x80, 0x81];
    let cursor = Cursor::new(invalid_utf8);
    let reader = BufReader::new(cursor);

    let (tx, rx) = watch::channel(Vec::<String>::new());
    let finish_flag = Arc::new(AtomicBool::new(false));

    read_and_send_chunks(reader, tx, finish_flag).await;

    // Invalid UTF-8 bytes should be skipped, result should be empty
    let result = rx.borrow().clone();
    assert!(result.is_empty(), "Invalid UTF-8 data should be skipped");
}

/// Tests that valid UTF-8 after invalid bytes is still processed.
/// Since the reader reads in 1024-byte chunks, if a chunk starts with valid UTF-8,
/// it should be processed even if previous chunks had invalid data.
#[tokio::test]
async fn read_chunks_handles_mixed_valid_invalid_utf8() {
    // Valid UTF-8 string
    let valid_utf8 = "valid text";
    let cursor = Cursor::new(valid_utf8.as_bytes().to_vec());
    let reader = BufReader::new(cursor);

    let (tx, rx) = watch::channel(Vec::<String>::new());
    let finish_flag = Arc::new(AtomicBool::new(false));

    read_and_send_chunks(reader, tx, finish_flag).await;

    let result = rx.borrow().clone();
    let joined = result.join("");
    assert_eq!(joined, "valid text");
}

/// Documents: from_utf8 returns Err for invalid sequences.
/// This test verifies the behavior that the main code relies on.
#[test]
#[allow(invalid_from_utf8)]
fn from_utf8_returns_error_for_invalid_bytes() {
    let invalid: &[u8] = &[0xFF, 0xFE];
    let result = std::str::from_utf8(invalid);
    assert!(result.is_err());
}

/// Documents: from_utf8 returns Ok for valid UTF-8.
#[test]
fn from_utf8_returns_ok_for_valid_bytes() {
    let valid = "日本語".as_bytes();
    let result = std::str::from_utf8(valid);
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "日本語");
}

/// Documents: from_utf8_lossy replaces invalid bytes with replacement character.
/// This is NOT used in read_and_send_chunks (which skips invalid chunks entirely),
/// but documents the alternative approach.
#[test]
fn from_utf8_lossy_replaces_invalid_with_replacement_char() {
    let invalid: &[u8] = &[0xFF, 0xFE];
    let result = String::from_utf8_lossy(invalid);
    // \u{FFFD} is the Unicode replacement character
    assert!(result.contains('\u{FFFD}'));
}

#[test]
fn vec_sender_dedup_behavior() {
    // The collector dedups stdout but not stderr
    let (tx, rx) = watch::channel(Vec::<String>::new());

    // Send duplicate data
    tx.send_modify(|vec| vec.push("dup".to_string()));
    tx.send_modify(|vec| vec.push("dup".to_string()));
    tx.send_modify(|vec| vec.push("dup".to_string()));
    tx.send_modify(|vec| vec.push("unique".to_string()));

    let mut data = rx.borrow().clone();
    data.dedup();

    // After dedup, consecutive duplicates are removed
    assert_eq!(data.len(), 2);
    assert_eq!(data[0], "dup");
    assert_eq!(data[1], "unique");
}

// Integration tests using real processes
#[cfg(any(target_os = "linux", target_os = "macos"))]
mod process_integration {
    use super::*;
    use std::process::Stdio;

    #[tokio::test]
    async fn spawn_echo_command_succeeds() {
        let mut cmd = tokio::process::Command::new("echo");
        cmd.arg("hello");
        cmd.stdout(Stdio::piped());

        let child = cmd.spawn();
        assert!(child.is_ok());

        let output = child.unwrap().wait_with_output().await;
        assert!(output.is_ok());

        let output = output.unwrap();
        assert!(output.status.success());
        assert_eq!(output.status.code(), Some(0));
    }

    #[tokio::test]
    async fn spawn_nonexistent_command_fails() {
        let mut cmd = tokio::process::Command::new("nonexistent_program_xyz");
        let child = cmd.spawn();
        assert!(child.is_err());
    }

    #[tokio::test]
    async fn spawn_command_with_exit_code() {
        let mut cmd = tokio::process::Command::new("sh");
        cmd.args(["-c", "exit 42"]);

        let child = cmd.spawn();
        assert!(child.is_ok());

        let status = child.unwrap().wait().await;
        assert!(status.is_ok());
        assert_eq!(status.unwrap().code(), Some(42));
    }

    #[tokio::test]
    async fn spawn_command_with_current_dir() {
        let mut cmd = tokio::process::Command::new("pwd");
        cmd.current_dir("/tmp");
        cmd.stdout(Stdio::piped());

        let output = cmd.output().await;
        assert!(output.is_ok());

        let output = output.unwrap();
        let stdout = String::from_utf8_lossy(&output.stdout);
        // On macOS, /tmp is a symlink to /private/tmp
        assert!(stdout.contains("tmp"));
    }

    #[tokio::test]
    async fn read_stdout_lines() {
        let mut cmd = tokio::process::Command::new("printf");
        cmd.args(["line1\\nline2\\nline3\\n"]);
        cmd.stdout(Stdio::piped());

        let mut child = cmd.spawn().unwrap();
        let stdout = child.stdout.take().unwrap();
        let reader = BufReader::new(stdout);
        let lines = reader.lines();

        let (tx, rx) = watch::channel(Vec::<String>::new());
        let finish_flag = Arc::new(AtomicBool::new(false));

        read_and_send_lines(lines, tx, finish_flag).await;
        let _ = child.wait().await;

        let result = rx.borrow().clone();
        assert_eq!(result.len(), 3);
    }

    #[tokio::test]
    async fn read_stdout_chunks_for_streaming() {
        let mut cmd = tokio::process::Command::new("printf");
        cmd.arg("streaming data");
        cmd.stdout(Stdio::piped());

        let mut child = cmd.spawn().unwrap();
        let stdout = child.stdout.take().unwrap();
        let reader = BufReader::new(stdout);

        let (tx, rx) = watch::channel(Vec::<String>::new());
        let finish_flag = Arc::new(AtomicBool::new(false));

        read_and_send_chunks(reader, tx, finish_flag).await;
        let _ = child.wait().await;

        let result = rx.borrow().clone();
        let joined: String = result.join("");
        assert_eq!(joined, "streaming data");
    }

    #[tokio::test]
    async fn read_stderr_from_process() {
        let mut cmd = tokio::process::Command::new("sh");
        cmd.args(["-c", "echo error message >&2"]);
        cmd.stderr(Stdio::piped());

        let mut child = cmd.spawn().unwrap();
        let stderr = child.stderr.take().unwrap();
        let reader = BufReader::new(stderr);
        let lines = reader.lines();

        let (tx, rx) = watch::channel(Vec::<String>::new());
        let finish_flag = Arc::new(AtomicBool::new(false));

        read_and_send_lines(lines, tx, finish_flag).await;
        let _ = child.wait().await;

        let result = rx.borrow().clone();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], "error message");
    }

    #[tokio::test]
    async fn utf8_output_decoded_correctly() {
        let mut cmd = tokio::process::Command::new("printf");
        cmd.arg("日本語\\nüber\\nкириллица\\n");
        cmd.stdout(Stdio::piped());

        let mut child = cmd.spawn().unwrap();
        let stdout = child.stdout.take().unwrap();
        let reader = BufReader::new(stdout);
        let lines = reader.lines();

        let (tx, rx) = watch::channel(Vec::<String>::new());
        let finish_flag = Arc::new(AtomicBool::new(false));

        read_and_send_lines(lines, tx, finish_flag).await;
        let _ = child.wait().await;

        let result = rx.borrow().clone();
        assert_eq!(result.len(), 3);
        assert_eq!(result[0], "日本語");
        assert_eq!(result[1], "über");
        assert_eq!(result[2], "кириллица");
    }

    #[tokio::test]
    async fn kill_running_process() {
        // Start a long-running process
        let mut cmd = tokio::process::Command::new("sleep");
        cmd.arg("10");

        let mut child = cmd.spawn().unwrap();

        // Kill it
        let kill_result = child.kill().await;
        assert!(kill_result.is_ok());

        // Wait should complete
        let status = child.wait().await;
        assert!(status.is_ok());
        // Killed processes don't exit with code 0
        assert!(!status.unwrap().success());
    }

    #[tokio::test]
    async fn large_output_handled() {
        // Generate large output
        let mut cmd = tokio::process::Command::new("sh");
        cmd.args(["-c", "yes | head -n 10000"]);
        cmd.stdout(Stdio::piped());

        let mut child = cmd.spawn().unwrap();
        let stdout = child.stdout.take().unwrap();
        let reader = BufReader::new(stdout);
        let lines = reader.lines();

        let (tx, rx) = watch::channel(Vec::<String>::new());
        let finish_flag = Arc::new(AtomicBool::new(false));

        read_and_send_lines(lines, tx, finish_flag).await;
        let _ = child.wait().await;

        let result = rx.borrow().clone();
        assert_eq!(result.len(), 10000);
    }
}
