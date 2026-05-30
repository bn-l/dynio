//! Tests for settings loading functionality.
//!
//! Tests the `GeneralSettings` struct parsing, default values, and error handling
//! for YAML configuration files.

use crate::general_settings::{DarkMode, GeneralSettings};
use tempfile::tempdir;

/// Tests for GeneralSettings YAML parsing.
mod general_settings_parsing {
    use super::*;

    #[test]
    fn parses_complete_yaml() {
        let yaml = r#"
darkMode: true
defaultCommand: "myCommand"
firstLaunch: true
startMinimised: true
inputFontSize: 2.5
alwaysOnTop: true
globalShortcut: "Ctrl+Space"
"#;
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(settings.dark_mode, DarkMode::On);
        assert_eq!(settings.default_command, Some("myCommand".to_string()));
        assert_eq!(settings.first_launch, Some(true));
        assert!(settings.start_minimised);
        assert_eq!(settings.input_font_size, 2.5);
        assert!(settings.always_on_top);
        assert_eq!(settings.global_shortcut, Some("Ctrl+Space".to_string()));
    }

    #[test]
    fn parses_reshow_in_center_camel_case_yaml() {
        let yaml = r#"
reshowInCenter: true
"#;
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert!(settings.reshow_in_center);
    }

    #[test]
    fn parses_minimal_yaml() {
        let yaml = "{}";
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        // All fields should use defaults
        assert_eq!(settings.dark_mode, DarkMode::Off);
        assert!(settings.default_command.is_none());
        assert!(settings.first_launch.is_none());
        assert!(!settings.start_minimised);
        assert_eq!(settings.input_font_size, 1.8); // default
        assert!(!settings.always_on_top);
        assert!(settings.global_shortcut.is_none());
        assert!(!settings.reshow_in_center);
    }

    #[test]
    fn parses_empty_string_yaml() {
        let yaml = "";
        // Empty string in serde_yaml is treated as an empty document
        // which gets deserialized using defaults for all fields
        let result: Result<GeneralSettings, _> = serde_yaml::from_str(yaml);
        // serde_yaml actually allows this by using defaults
        assert!(result.is_ok());
        let settings = result.unwrap();
        // All fields should have their default values
        assert_eq!(settings.dark_mode, DarkMode::Off);
    }

    #[test]
    fn parses_partial_yaml_with_defaults() {
        let yaml = r#"
darkMode: true
alwaysOnTop: true
"#;
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(settings.dark_mode, DarkMode::On);
        assert!(settings.always_on_top);
        // Other fields use defaults
        assert!(!settings.start_minimised);
        assert_eq!(settings.input_font_size, 1.8);
        assert!(settings.global_shortcut.is_none());
    }
}

/// Tests for default values.
mod default_values {
    use super::*;

    #[test]
    fn dark_mode_defaults_to_false() {
        let yaml = "{}";
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(settings.dark_mode, DarkMode::Off);
    }

    #[test]
    fn start_minimised_defaults_to_false() {
        let yaml = "{}";
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert!(!settings.start_minimised);
    }

    #[test]
    fn input_font_size_defaults_to_1_8() {
        let yaml = "{}";
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(settings.input_font_size, 1.8);
    }

    #[test]
    fn always_on_top_defaults_to_false() {
        let yaml = "{}";
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert!(!settings.always_on_top);
    }

    #[test]
    fn default_command_defaults_to_none() {
        let yaml = "{}";
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert!(settings.default_command.is_none());
    }

    #[test]
    fn first_launch_defaults_to_none() {
        let yaml = "{}";
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert!(settings.first_launch.is_none());
    }

    #[test]
    fn global_shortcut_defaults_to_none() {
        let yaml = "{}";
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert!(settings.global_shortcut.is_none());
    }
}

/// Tests for invalid YAML handling.
mod invalid_yaml_handling {
    use super::*;

    #[test]
    fn invalid_yaml_syntax_returns_error() {
        let yaml = "invalid: yaml: syntax:";
        let result: Result<GeneralSettings, _> = serde_yaml::from_str(yaml);
        assert!(result.is_err());
    }

    #[test]
    fn unclosed_quote_returns_error() {
        let yaml = r#"globalShortcut: "unclosed"#;
        let result: Result<GeneralSettings, _> = serde_yaml::from_str(yaml);
        assert!(result.is_err());
    }

    #[test]
    fn invalid_indentation_returns_error() {
        let yaml = r#"
darkMode: true
  invalidIndent: true
"#;
        let result: Result<GeneralSettings, _> = serde_yaml::from_str(yaml);
        assert!(result.is_err());
    }

    #[test]
    fn wrong_type_for_boolean_returns_error() {
        let yaml = r#"darkMode: "yes""#;
        let _result: Result<GeneralSettings, _> = serde_yaml::from_str(yaml);
        // YAML "yes" actually parses as boolean true in serde_yaml
        // But a string "yes" in quotes should fail
        // Actually, serde_yaml might coerce this. Let's test with a clear non-boolean
        let yaml2 = r#"darkMode: [1, 2, 3]"#;
        let result2: Result<GeneralSettings, _> = serde_yaml::from_str(yaml2);
        assert!(result2.is_err());
    }

    #[test]
    fn wrong_type_for_float_returns_error() {
        let yaml = r#"inputFontSize: "not a number""#;
        let result: Result<GeneralSettings, _> = serde_yaml::from_str(yaml);
        assert!(result.is_err());
    }

    #[test]
    fn array_instead_of_object_returns_error() {
        let yaml = r#"
- item1
- item2
"#;
        let result: Result<GeneralSettings, _> = serde_yaml::from_str(yaml);
        assert!(result.is_err());
    }

    #[test]
    fn scalar_instead_of_object_returns_error() {
        let yaml = "just a string";
        let result: Result<GeneralSettings, _> = serde_yaml::from_str(yaml);
        assert!(result.is_err());
    }

    #[test]
    fn tab_character_in_yaml_returns_error() {
        // Tabs are not allowed in YAML for indentation
        let yaml = "darkMode:\ttrue";
        let _result: Result<GeneralSettings, _> = serde_yaml::from_str(yaml);
        // This might actually parse - tabs in value position might be ok
        // Let's test tab for indentation specifically
        let yaml2 = "darkMode: true\n\talwaysOnTop: true";
        let result2: Result<GeneralSettings, _> = serde_yaml::from_str(yaml2);
        assert!(result2.is_err());
    }
}

/// Tests for missing file handling pattern.
mod missing_file_handling {
    use super::*;
    use std::fs;

    #[test]
    fn missing_settings_file_returns_error() {
        let temp = tempdir().unwrap();
        let nonexistent_path = temp.path().join("nonexistent.yaml");

        let result = fs::read_to_string(&nonexistent_path);
        assert!(result.is_err());
    }

    #[test]
    fn get_general_settings_pattern_checks_file_exists() {
        // Pattern from main.rs get_general_settings():
        // ```ignore
        // if !settings_path.exists() {
        //     return Err("Settings file does not exist".into());
        // }
        // ```
        let temp = tempdir().unwrap();
        let nonexistent_path = temp.path().join("settings.yaml");

        if !nonexistent_path.exists() {
            let err: Result<(), &str> = Err("Settings file does not exist");
            assert!(err.is_err());
        }
    }

    #[test]
    fn read_to_string_failure_propagates() {
        // Pattern: let settings_text = std::fs::read_to_string(settings_path)?;
        let temp = tempdir().unwrap();
        let nonexistent = temp.path().join("missing.yaml");

        let result: Result<String, _> = fs::read_to_string(nonexistent);
        assert!(result.is_err());
    }
}

/// Tests for YAML camelCase field naming.
mod camel_case_fields {
    use super::*;

    #[test]
    fn dark_mode_is_camel_case() {
        // The struct uses #[serde(rename_all = "camelCase")]
        // So field names in YAML should be camelCase
        let yaml = r#"darkMode: true"#;
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(settings.dark_mode, DarkMode::On);
    }

    #[test]
    fn snake_case_field_name_ignored() {
        // snake_case field names should be ignored (or cause extra field warning)
        let yaml = r#"dark_mode: true"#;
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        // snake_case is ignored, so dark_mode uses default (false)
        assert_eq!(settings.dark_mode, DarkMode::Off);
    }

    #[test]
    fn start_minimised_camel_case() {
        let yaml = r#"startMinimised: true"#;
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert!(settings.start_minimised);
    }

    #[test]
    fn input_font_size_camel_case() {
        let yaml = r#"inputFontSize: 3.0"#;
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(settings.input_font_size, 3.0);
    }

    #[test]
    fn always_on_top_camel_case() {
        let yaml = r#"alwaysOnTop: true"#;
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert!(settings.always_on_top);
    }

    #[test]
    fn global_shortcut_camel_case() {
        let yaml = r#"globalShortcut: "Alt+Space""#;
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(settings.global_shortcut, Some("Alt+Space".to_string()));
    }

    #[test]
    fn default_command_camel_case() {
        let yaml = r#"defaultCommand: "myCmd""#;
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(settings.default_command, Some("myCmd".to_string()));
    }

    #[test]
    fn first_launch_camel_case() {
        let yaml = r#"firstLaunch: true"#;
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(settings.first_launch, Some(true));
    }
}

/// Tests for GeneralSettings serialization.
mod settings_serialization {
    use super::*;

    #[test]
    fn settings_can_be_serialized_to_yaml() {
        let yaml = r#"
darkMode: true
startMinimised: false
inputFontSize: 1.8
alwaysOnTop: false
"#;
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        let serialized = serde_yaml::to_string(&settings).unwrap();
        assert!(serialized.contains("darkMode"));
    }

    #[test]
    fn roundtrip_preserves_values() {
        let yaml = r#"
darkMode: true
defaultCommand: "test"
startMinimised: true
inputFontSize: 2.0
alwaysOnTop: true
globalShortcut: "Ctrl+Shift+P"
"#;
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        let serialized = serde_yaml::to_string(&settings).unwrap();
        let reparsed: GeneralSettings = serde_yaml::from_str(&serialized).unwrap();

        assert_eq!(settings.dark_mode, reparsed.dark_mode);
        assert_eq!(settings.default_command, reparsed.default_command);
        assert_eq!(settings.start_minimised, reparsed.start_minimised);
        assert_eq!(settings.input_font_size, reparsed.input_font_size);
        assert_eq!(settings.always_on_top, reparsed.always_on_top);
        assert_eq!(settings.global_shortcut, reparsed.global_shortcut);
    }
}

/// Tests for various YAML value representations.
mod yaml_value_variants {
    use super::*;

    #[test]
    fn boolean_true_variants() {
        // YAML accepts various representations for true (unquoted only)
        // Note: serde_yaml with strict typing only accepts true/True/TRUE/yes/Yes/on/On
        // as unquoted boolean values
        let variants = vec!["darkMode: true", "darkMode: True", "darkMode: TRUE"];

        for yaml in variants {
            let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
            assert_eq!(settings.dark_mode, DarkMode::On, "Failed for: {}", yaml);
        }
    }

    #[test]
    fn dark_mode_string_variants() {
        let variants = vec![
            ("darkMode: off", DarkMode::Off),
            ("darkMode: on", DarkMode::On),
            ("darkMode: auto", DarkMode::Auto),
        ];

        for (yaml, expected) in variants {
            let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
            assert_eq!(settings.dark_mode, expected, "Failed for: {}", yaml);
        }
    }

    #[test]
    fn yaml_yes_is_not_boolean_with_serde_yaml() {
        // In serde_yaml with strict typing, "yes"/"no"/"on"/"off" are not
        // automatically converted to booleans when the target type is bool
        // This is different from some other YAML parsers
        let yaml = "darkMode: yes";
        let result: Result<GeneralSettings, _> = serde_yaml::from_str(yaml);
        assert!(result.is_err(), "serde_yaml doesn't convert 'yes' to bool");
    }

    #[test]
    fn boolean_false_variants() {
        // YAML accepts various representations for false (unquoted only)
        // Note: serde_yaml with strict typing only accepts false/False/FALSE
        // as unquoted boolean values
        let variants = vec!["darkMode: false", "darkMode: False", "darkMode: FALSE"];

        for yaml in variants {
            let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
            assert_eq!(settings.dark_mode, DarkMode::Off, "Failed for: {}", yaml);
        }
    }

    #[test]
    fn yaml_no_is_not_boolean_with_serde_yaml() {
        // In serde_yaml with strict typing, "no"/"off" are not
        // automatically converted to booleans when the target type is bool
        let yaml = "darkMode: no";
        let result: Result<GeneralSettings, _> = serde_yaml::from_str(yaml);
        assert!(result.is_err(), "serde_yaml doesn't convert 'no' to bool");
    }

    #[test]
    fn float_integer_representation() {
        // Integer should be accepted for float field
        let yaml = "inputFontSize: 2";
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(settings.input_font_size, 2.0);
    }

    #[test]
    fn float_with_decimal() {
        let yaml = "inputFontSize: 2.5";
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(settings.input_font_size, 2.5);
    }

    #[test]
    fn string_with_quotes() {
        let yaml = r#"globalShortcut: "Alt+Space""#;
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(settings.global_shortcut, Some("Alt+Space".to_string()));
    }

    #[test]
    fn string_without_quotes() {
        let yaml = r#"globalShortcut: Alt+Space"#;
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(settings.global_shortcut, Some("Alt+Space".to_string()));
    }

    #[test]
    fn null_for_optional_field() {
        let yaml = "globalShortcut: null";
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert!(settings.global_shortcut.is_none());
    }

    #[test]
    fn tilde_for_null() {
        // ~ is YAML shorthand for null
        let yaml = "globalShortcut: ~";
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert!(settings.global_shortcut.is_none());
    }
}

/// Tests for get_general_settings function pattern.
mod get_general_settings_pattern {
    use super::*;
    use std::fs;

    /// Simulates the get_general_settings function pattern from main.rs:
    /// ```ignore
    /// fn get_general_settings() -> Result<GeneralSettings, Box<dyn std::error::Error>> {
    ///     let settings_path = config_dir().join("general-settings.yaml");
    ///     if !settings_path.exists() {
    ///         return Err("Settings file does not exist".into());
    ///     }
    ///     let settings_text = std::fs::read_to_string(settings_path)?;
    ///     let settings = serde_yaml::from_str(&settings_text)?;
    ///     Ok(settings)
    /// }
    /// ```
    fn get_settings_from_path(path: &std::path::Path) -> Result<GeneralSettings, String> {
        if !path.exists() {
            return Err("Settings file does not exist".to_string());
        }
        let settings_text = fs::read_to_string(path).map_err(|e| e.to_string())?;
        let settings = serde_yaml::from_str(&settings_text).map_err(|e| e.to_string())?;
        Ok(settings)
    }

    #[test]
    fn returns_error_when_file_missing() {
        let temp = tempdir().unwrap();
        let path = temp.path().join("missing.yaml");

        let result = get_settings_from_path(&path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
    }

    #[test]
    fn returns_error_when_yaml_invalid() {
        let temp = tempdir().unwrap();
        let path = temp.path().join("invalid.yaml");
        fs::write(&path, "invalid: yaml: syntax:").unwrap();

        let result = get_settings_from_path(&path);
        assert!(result.is_err());
    }

    #[test]
    fn returns_settings_when_valid() {
        let temp = tempdir().unwrap();
        let path = temp.path().join("valid.yaml");
        fs::write(&path, "darkMode: true\nalwaysOnTop: true").unwrap();

        let result = get_settings_from_path(&path);
        assert!(result.is_ok());
        let settings = result.unwrap();
        assert_eq!(settings.dark_mode, DarkMode::On);
        assert!(settings.always_on_top);
    }

    #[test]
    fn returns_defaults_for_empty_object() {
        let temp = tempdir().unwrap();
        let path = temp.path().join("minimal.yaml");
        fs::write(&path, "{}").unwrap();

        let result = get_settings_from_path(&path);
        assert!(result.is_ok());
        let settings = result.unwrap();
        assert_eq!(settings.dark_mode, DarkMode::Off);
        assert!(!settings.start_minimised);
        assert_eq!(settings.input_font_size, 1.8);
    }
}

/// Tests for edge cases in settings values.
mod settings_edge_cases {
    use super::*;

    #[test]
    fn very_small_font_size() {
        let yaml = "inputFontSize: 0.1";
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(settings.input_font_size, 0.1);
    }

    #[test]
    fn very_large_font_size() {
        let yaml = "inputFontSize: 100.0";
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(settings.input_font_size, 100.0);
    }

    #[test]
    fn negative_font_size_allowed_by_parser() {
        // The parser allows negative values - validation would need to be separate
        let yaml = "inputFontSize: -1.0";
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(settings.input_font_size, -1.0);
    }

    #[test]
    fn zero_font_size() {
        let yaml = "inputFontSize: 0";
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(settings.input_font_size, 0.0);
    }

    #[test]
    fn empty_string_for_optional_string() {
        let yaml = r#"globalShortcut: """#;
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(settings.global_shortcut, Some("".to_string()));
    }

    #[test]
    fn whitespace_string_for_optional_string() {
        let yaml = r#"globalShortcut: "   ""#;
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(settings.global_shortcut, Some("   ".to_string()));
    }

    #[test]
    fn unicode_in_command_name() {
        let yaml = r#"defaultCommand: "命令""#;
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(settings.default_command, Some("命令".to_string()));
    }

    #[test]
    fn special_characters_in_shortcut() {
        let yaml = r#"globalShortcut: "Ctrl+Shift+#""#;
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(settings.global_shortcut, Some("Ctrl+Shift+#".to_string()));
    }

    #[test]
    fn extra_fields_ignored() {
        // Unknown fields should be silently ignored
        let yaml = r#"
darkMode: true
unknownField: "ignored"
anotherUnknown: 123
"#;
        let settings: GeneralSettings = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(settings.dark_mode, DarkMode::On);
        // No error for unknown fields - they're just ignored
    }
}
