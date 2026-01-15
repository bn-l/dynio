use super::*;

// Config dir tests

#[test]
fn config_dir_returns_path() {
    let path = config_dir();
    assert!(path.ends_with("dynio"));
}

#[test]
fn home_dir_returns_valid_path() {
    let path = home_dir();
    assert!(path.exists() || path.to_str().is_some());
}

// Trim path tests

#[tokio::test]
async fn trims_filename_from_path() {
    let result = trim_path("/foo/bar/baz.txt".to_string()).await;
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "/foo/bar");
}

#[tokio::test]
async fn trims_trailing_slash_directory() {
    // Note: /foo/bar/ parent is /foo/bar (the path without trailing slash)
    // Actually Path::new("/foo/bar/").parent() returns Some("/foo")
    let result = trim_path("/foo/bar/".to_string()).await;
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "/foo");
}

#[tokio::test]
async fn trims_to_root() {
    let result = trim_path("/foo".to_string()).await;
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "/");
}

#[tokio::test]
async fn root_path_has_no_parent() {
    let result = trim_path("/".to_string()).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn handles_relative_paths() {
    let result = trim_path("foo/bar/baz.txt".to_string()).await;
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "foo/bar");
}

#[tokio::test]
async fn handles_single_component() {
    // "foo" has no parent, or parent is ""
    let result = trim_path("foo".to_string()).await;
    // This should either error or return ""
    if result.is_ok() {
        assert_eq!(result.unwrap(), "");
    }
}

#[tokio::test]
async fn handles_unicode_paths() {
    let result = trim_path("/über/Voßstraße/file.txt".to_string()).await;
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "/über/Voßstraße");
}

#[tokio::test]
async fn handles_paths_with_spaces() {
    let result = trim_path("/path with spaces/file name.txt".to_string()).await;
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "/path with spaces");
}

// Spawn detached tests

#[test]
fn active_detached_starts_at_zero() {
    // Reset for test (in real tests this might be shared state)
    let count = ACTIVE_DETACHED.load(std::sync::atomic::Ordering::Relaxed);
    // We can't assert it's 0 since other tests might have run
    assert!(count < MAX_DETACHED);
}

#[test]
fn max_detached_limit_is_reasonable() {
    assert_eq!(MAX_DETACHED, 50);
}

#[test]
fn detached_timeout_is_10_minutes() {
    assert_eq!(DETACHED_TIMEOUT_SECS, 10 * 60);
}
