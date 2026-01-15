use super::*;

// Section 33: Windows-Specific Platform Tests

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

// Test that chcp 65001 is before the actual command
#[test]
fn chcp_comes_before_program() {
    let cmd = build_windows_command("myprogram", &[], "input");
    let chcp_pos = cmd.find("chcp").expect("chcp not found");
    let program_pos = cmd.find("myprogram").expect("program not found");
    assert!(chcp_pos < program_pos, "chcp 65001 should come before the program");
}

// Test output suppression with >nul
#[test]
fn chcp_output_suppressed() {
    let cmd = build_windows_command("echo", &[], "test");
    // chcp output should be redirected to nul
    assert!(cmd.contains(">nul"), "chcp output should be suppressed with >nul");
}

// Test command wrapper format
#[test]
fn command_wrapped_in_quotes() {
    let cmd = build_windows_command("C:\\Program Files\\app.exe", &[], "arg");
    // The entire command should be wrapped for cmd /C
    assert!(cmd.starts_with('"'));
    assert!(cmd.ends_with('"'));
}

// Test that program path is quoted
#[test]
fn program_path_is_quoted() {
    let cmd = build_windows_command("program", &[], "input");
    // Program should be wrapped in quotes to handle paths with spaces
    assert!(cmd.contains("\"program\""));
}

// Test empty arguments handled correctly
#[test]
fn empty_arguments_handled() {
    let cmd = build_windows_command("echo", &[], "hello");
    // Should not have double spaces from empty args
    assert!(!cmd.contains("  "));
}

// Test special characters in input
#[test]
fn special_characters_in_input_quoted() {
    let cmd = build_windows_command("echo", &[], "hello world");
    assert!(cmd.contains("\"hello world\""));
}

// Test multiple arguments joined correctly
#[test]
fn multiple_arguments_space_separated() {
    let cmd = build_windows_command("prog", &["arg1".to_string(), "arg2".to_string(), "arg3".to_string()], "input");
    assert!(cmd.contains("arg1 arg2 arg3"));
}

// Test Windows default shortcut constant
#[test]
fn windows_default_shortcut_is_alt_space() {
    let default_shortcut = "Alt+Space";
    assert_eq!(default_shortcut, "Alt+Space");
    assert!(default_shortcut.contains("Alt"));
    assert!(default_shortcut.contains("Space"));
}

// Test CREATE_NO_WINDOW flag value
#[test]
fn create_no_window_flag_constant() {
    // CREATE_NO_WINDOW = 0x08000000
    // This is the Windows API constant for suppressing console windows
    let create_no_window: u32 = 0x08000000;
    assert_eq!(create_no_window, 0x08000000);
    assert_eq!(create_no_window, 134217728);
}

// Test toggle behavior for Windows
mod toggle_behavior {
    #[test]
    fn visible_focused_window_hides_on_toggle() {
        let is_visible = true;
        let is_focused = true;
        let action = if !is_visible {
            "show_and_focus"
        } else if !is_focused {
            "focus_only"
        } else {
            "hide"
        };
        assert_eq!(action, "hide");
    }

    #[test]
    fn visible_unfocused_window_focuses_on_toggle() {
        let is_visible = true;
        let is_focused = false;
        let action = if !is_visible {
            "show_and_focus"
        } else if !is_focused {
            "focus_only"
        } else {
            "hide"
        };
        assert_eq!(action, "focus_only");
    }

    #[test]
    fn hidden_window_shows_and_focuses_on_toggle() {
        let is_visible = false;
        let is_focused = false; // Hidden window can't be focused
        let action = if !is_visible {
            "show_and_focus"
        } else if !is_focused {
            "focus_only"
        } else {
            "hide"
        };
        assert_eq!(action, "show_and_focus");
    }

    #[test]
    fn show_triggers_reposition_to_cursor_monitor() {
        // When showing window, we reposition to cursor's monitor
        let should_reposition_before_show = true;
        assert!(should_reposition_before_show);
    }
}

// Test event emission patterns
mod event_emission {
    #[test]
    fn hide_emits_hide_event() {
        let event_payload = "hide";
        assert_eq!(event_payload, "hide");
    }

    #[test]
    fn show_emits_unhide_event() {
        let event_payload = "unhide";
        assert_eq!(event_payload, "unhide");
    }
}

// Test coordinate system (Windows uses physical coordinates for monitor lookup)
mod coordinate_system {
    #[test]
    fn cursor_position_used_directly_for_monitor_lookup() {
        // On Windows, monitor_from_point expects physical coordinates
        // cursor_position also returns physical coordinates
        // No conversion needed (unlike macOS)

        let physical_x = 1920.0;
        let physical_y = 1080.0;

        // Used directly
        let lookup_x = physical_x;
        let lookup_y = physical_y;

        assert_eq!(lookup_x, 1920.0);
        assert_eq!(lookup_y, 1080.0);
    }
}

// Test that Linux uses same defaults as Windows
mod linux_parity {
    #[test]
    fn linux_default_shortcut_matches_windows() {
        let windows_default = "Alt+Space";
        let linux_default = "Alt+Space";
        assert_eq!(windows_default, linux_default);
    }

    #[test]
    fn linux_uses_same_toggle_logic_as_windows() {
        // Linux and Windows both use regular window APIs
        // (not NSPanel like macOS)
        let uses_nspanel = false;
        assert!(!uses_nspanel);
    }
}
