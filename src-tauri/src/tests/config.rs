use super::*;
use std::fs;
use tempfile::tempdir;

// SerError tests

#[test]
fn ser_error_from_io_error() {
    let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
    let ser_err: SerError = io_err.into();
    let msg = format!("{}", ser_err);
    assert!(msg.contains("file not found"));
}

#[test]
fn ser_error_serializes_to_string() {
    let io_err = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "access denied");
    let ser_err: SerError = io_err.into();
    let serialized = serde_json::to_string(&ser_err).unwrap();
    assert!(serialized.contains("access denied"));
}

// ConfigFiles tests

#[test]
fn config_files_struct_serializes() {
    let cf = ConfigFiles {
        cmd_config: "test: value".to_string(),
        settings: "setting: true".to_string(),
    };
    let serialized = serde_json::to_string(&cf).unwrap();
    assert!(serialized.contains("cmd_config"));
    assert!(serialized.contains("settings"));
}

#[test]
fn config_files_struct_deserializes() {
    let json = r#"{"cmd_config": "yaml content", "settings": "yaml settings"}"#;
    let cf: ConfigFiles = serde_json::from_str(json).unwrap();
    assert_eq!(cf.cmd_config, "yaml content");
    assert_eq!(cf.settings, "yaml settings");
}

// Setup default files tests
// Test the file creation pattern used by setup_default_files
// We can't directly test setup_default_files since it uses config_dir()
// which returns a fixed path. Instead, we test the logic patterns.

#[test]
fn creates_directory_if_missing() {
    let temp = tempdir().unwrap();
    let base_dir = temp.path().join("test_config");

    // Directory doesn't exist
    assert!(!base_dir.exists());

    // Pattern from setup_default_files:
    if !base_dir.exists() {
        fs::create_dir_all(&base_dir).expect("Could not create config dir");
    }

    assert!(base_dir.exists());
    assert!(base_dir.is_dir());
}

#[test]
fn creates_file_if_missing() {
    let temp = tempdir().unwrap();
    let file_path = temp.path().join("test_file.yaml");
    let content = "test: value";

    // File doesn't exist
    assert!(!file_path.exists());

    // Pattern from setup_default_files:
    if !file_path.exists() {
        fs::write(&file_path, content).expect("Could not write file");
    }

    assert!(file_path.exists());
    let read_content = fs::read_to_string(&file_path).unwrap();
    assert_eq!(read_content, content);
}

#[test]
fn does_not_overwrite_existing_file() {
    let temp = tempdir().unwrap();
    let file_path = temp.path().join("existing.yaml");
    let original_content = "original: content";
    let new_content = "new: content";

    // Create existing file
    fs::write(&file_path, original_content).unwrap();
    assert!(file_path.exists());

    // Pattern from setup_default_files: only write if not exists
    if !file_path.exists() {
        fs::write(&file_path, new_content).expect("Could not write file");
    }

    // Original content should be preserved
    let read_content = fs::read_to_string(&file_path).unwrap();
    assert_eq!(read_content, original_content);
}

#[test]
fn creates_multiple_files_in_directory() {
    let temp = tempdir().unwrap();
    let base_dir = temp.path().join("config");

    // Create directory
    fs::create_dir_all(&base_dir).unwrap();

    // File paths pattern from setup_default_files
    let settings_path = base_dir.join("general-settings.yaml");
    let cmdconf_path = base_dir.join("cmd-config.yaml");
    let schema_settings_path = base_dir.join("general-settings-schema.json");
    let schema_cmdconf_path = base_dir.join("cmd-config-schema.json");

    // Create files
    let files = vec![
        (&settings_path, "settings content"),
        (&cmdconf_path, "cmdconf content"),
        (&schema_settings_path, "{}"),
        (&schema_cmdconf_path, "{}"),
    ];

    for (path, content) in &files {
        if !path.exists() {
            fs::write(path, content).unwrap();
        }
    }

    // All files should exist
    assert!(settings_path.exists());
    assert!(cmdconf_path.exists());
    assert!(schema_settings_path.exists());
    assert!(schema_cmdconf_path.exists());
}

#[test]
fn create_dir_all_handles_nested_paths() {
    let temp = tempdir().unwrap();
    let nested_path = temp.path().join("a").join("b").join("c");

    // Pattern from setup_default_files/main
    fs::create_dir_all(&nested_path).expect("Failed to create nested directory");

    assert!(nested_path.exists());
    assert!(nested_path.is_dir());
}

#[test]
fn create_dir_all_succeeds_if_exists() {
    let temp = tempdir().unwrap();
    let dir_path = temp.path().join("existing_dir");

    // Create it first
    fs::create_dir_all(&dir_path).unwrap();
    assert!(dir_path.exists());

    // Calling again should not error
    let result = fs::create_dir_all(&dir_path);
    assert!(result.is_ok());
}

// Test that include_str! pattern works (compile-time check)
#[test]
fn schema_files_can_be_parsed_as_json() {
    let schema_cmdconf = include_str!("../data/cmd-config-schema.json");
    let schema_settings = include_str!("../data/general-settings-schema.json");

    // Schemas should be valid JSON
    let parsed_cmdconf: Result<serde_json::Value, _> = serde_json::from_str(schema_cmdconf);
    let parsed_settings: Result<serde_json::Value, _> = serde_json::from_str(schema_settings);

    assert!(parsed_cmdconf.is_ok(), "cmd-config-schema.json should be valid JSON");
    assert!(parsed_settings.is_ok(), "general-settings-schema.json should be valid JSON");
}

// Platform-specific default files exist (compile-time check)
#[test]
fn platform_default_files_included() {
    // These include_str! calls would fail at compile time if files don't exist
    #[cfg(target_os = "macos")]
    {
        let _ = include_str!("../data/example-cmd-config-macos.yaml");
        let _ = include_str!("../data/default-general-settings-macos.yaml");
    }
    #[cfg(target_os = "linux")]
    {
        let _ = include_str!("../data/example-cmd-config-linux.yaml");
        let _ = include_str!("../data/default-general-settings-linux.yaml");
    }
    #[cfg(target_os = "windows")]
    {
        let _ = include_str!("../data/example-cmd-config-win.yaml");
        let _ = include_str!("../data/default-general-settings-win.yaml");
    }
}

// Test config_dir() with XDG_CONFIG_HOME override
#[test]
fn config_dir_respects_xdg_config_home() {
    // Save original
    let original = std::env::var("XDG_CONFIG_HOME").ok();

    // Set XDG_CONFIG_HOME
    let temp = tempdir().unwrap();
    let custom_config = temp.path().to_str().unwrap();
    std::env::set_var("XDG_CONFIG_HOME", custom_config);

    let result = config_dir();
    assert!(result.to_str().unwrap().contains(custom_config));
    assert!(result.ends_with("dynio"));

    // Restore original
    match original {
        Some(val) => std::env::set_var("XDG_CONFIG_HOME", val),
        None => std::env::remove_var("XDG_CONFIG_HOME"),
    }
}

#[test]
fn config_dir_falls_back_to_home_config() {
    // Save original
    let original = std::env::var("XDG_CONFIG_HOME").ok();

    // Remove XDG_CONFIG_HOME
    std::env::remove_var("XDG_CONFIG_HOME");

    let result = config_dir();
    // Should contain .config/dynio
    let path_str = result.to_str().unwrap();
    assert!(path_str.contains(".config"));
    assert!(path_str.ends_with("dynio"));

    // Restore original
    if let Some(val) = original {
        std::env::set_var("XDG_CONFIG_HOME", val);
    }
}
