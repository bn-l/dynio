use super::*;

#[test]
fn build_windows_command_basic() {
    let cmd = build_windows_command("echo", &[], "hello");
    assert!(cmd.contains("chcp 65001"));
    assert!(cmd.contains("echo"));
    assert!(cmd.contains("hello"));
}

#[test]
fn build_windows_command_with_arguments() {
    let cmd = build_windows_command("program", &["--flag".to_string(), "-v".to_string()], "input");
    assert!(cmd.contains("--flag"));
    assert!(cmd.contains("-v"));
    assert!(cmd.contains("input"));
}
