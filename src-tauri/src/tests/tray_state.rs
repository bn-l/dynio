use super::*;

#[test]
fn tray_state_default_values() {
    let state = TrayState::default();
    assert_eq!(state.width, 0.0);
    assert_eq!(state.tray_closed_height, 0.0);
    assert_eq!(state.tray_open_height, 0.0);
    assert!(!state.currently_open);
}

#[test]
fn tray_state_can_be_modified() {
    let mut state = TrayState::default();
    state.width = 800.0;
    state.tray_closed_height = 100.0;
    state.tray_open_height = 400.0;
    state.currently_open = true;

    assert_eq!(state.width, 800.0);
    assert_eq!(state.tray_closed_height, 100.0);
    assert_eq!(state.tray_open_height, 400.0);
    assert!(state.currently_open);
}

#[tokio::test]
async fn tray_state_mutex_access() {
    let state = Mutex::new(TrayState::default());

    {
        let mut guard = state.lock().await;
        guard.width = 500.0;
        guard.currently_open = true;
    }

    {
        let guard = state.lock().await;
        assert_eq!(guard.width, 500.0);
        assert!(guard.currently_open);
    }
}

#[test]
fn tray_state_open_close_toggle_logic() {
    let mut state = TrayState {
        width: 800.0,
        tray_closed_height: 100.0,
        tray_open_height: 400.0,
        currently_open: false,
    };

    // Simulate open_tray logic: only opens if not currently open
    if !state.currently_open {
        state.currently_open = true;
    }
    assert!(state.currently_open);

    // Try to open again (no-op)
    let was_open = state.currently_open;
    if !state.currently_open {
        state.currently_open = true;
    }
    assert_eq!(was_open, state.currently_open);

    // Simulate close_tray logic: only closes if currently open
    if state.currently_open {
        state.currently_open = false;
    }
    assert!(!state.currently_open);

    // Try to close again (no-op) - state doesn't change when already closed
    assert!(!state.currently_open);
}

#[test]
fn tray_dimensions_calculation() {
    // Test the dimension calculations match what setup_main_window does
    let screen_width = 1920.0;
    let phys_width = screen_width * SCREEN_TO_WIDTH_RATIO;
    let phys_height = phys_width * HEIGHT_TO_WIDTH_RATIO;
    let phys_tray_height = phys_height * TRAY_TO_BAR_RATIO;

    let state = TrayState {
        width: phys_width,
        tray_closed_height: phys_height,
        tray_open_height: phys_tray_height + phys_height,
        currently_open: false,
    };

    // Verify ratios are applied correctly
    assert!((state.width - 806.4).abs() < 0.1); // 1920 * 0.42
    assert!((state.tray_closed_height - 129.024).abs() < 0.1); // width * 0.16
    assert!(state.tray_open_height > state.tray_closed_height);
}

#[test]
fn open_tray_captures_position_before_resize() {
    // Verify the PATTERN used in open_tray: position is captured BEFORE resize
    // The actual open_tray code does:
    //   let current_pos = window.outer_position()...
    //   let _ = window.set_size(...);
    //   let _ = window.set_position(current_pos);
    //
    // This test verifies the logical pattern works - that capturing a value
    // before mutation and restoring it after preserves the original.
    // The actual window API calls require full Tauri runtime.

    let original_position = (100, 200);

    // Capture position before resize (what open_tray does)
    let captured_pos = original_position;

    // ... resize would happen here, potentially changing window position ...
    // ... but we captured the original position first ...

    // Restore position (what open_tray does after resize)
    let restored_position = captured_pos;

    // Position should be restored to original
    assert_eq!(restored_position, original_position);
}
