# Devlog

## 2026-05-30: Drag smoothness + saved placement with tray height changes

**Symptom**: Dragging the bar was choppy and used too much CPU after switching to a custom JS mousemove loop. The same change also reintroduced a position drift bug: if the tray expanded, the window was hidden, and the empty state caused the tray to close before the next reveal, the bar could jump lower on show.

**Root cause (drag)**: The drag path sent a Tauri IPC command on every `mousemove` and moved the window manually from JS. A later attempted fix incorrectly routed Tauri's native drag through a backend command, which delayed the drag start enough that the bar no longer tracked the pointer cleanly. Another attempted fix added backend center snapping from `WindowEvent::Moved`, which called `set_position` while the OS native drag was in progress and could fight the pointer.

**Root cause (reveal jump)**: Saved placement was stored as a ratio of the monitor's available area after subtracting the current window height. Dragging while the tray was open saved a ratio using the tall tray height; revealing later with only the closed bar height converted that same ratio into a lower top-left y position. Startup also had a separate placement path that ignored saved monitor placement and centered on the primary monitor, while hotkey reveal used the saved cursor-monitor placement; that made `launch -> hide -> show` jump to a different location.

**Fix**:
- Call Tauri's native `startDragging()` directly from the frontend `mousedown` handler so the OS drag starts in the pointer event.
- Observe backend `WindowEvent::Moved` events only to remember the last drag position for persistence instead of sending frontend mousemove IPC.
- Persist placement at drag finish instead of writing the placement file on every move.
- Keep only one fallback finish watcher per drag, so missed mouseup/blur cleanup does not create per-move background work.
- Store saved placements as monitor-relative top-left ratios, not available-area ratios, so changing between open tray and closed bar heights preserves the bar's top position.
- When there is no saved placement yet, center on the cursor monitor instead of preserving a hidden window position that may already have drifted.
- Use the same cursor-monitor saved-placement logic on startup and hotkey reveal, so first hide/show is not a transition from startup-center to saved placement.
- Removed center snapping from the backend drag path. The move handler no longer calls `set_position` while native drag is in progress.

**Regression tests**:
- DragSpot tests assert no backend `update_window_drag` mousemove loop and require direct frontend `startDragging()`.
- Window drag tests assert that near-center move positions are recorded unchanged, with no center snap adjustment.
- Window placement tests assert that startup and first reveal use the same saved placement.
- Window placement tests assert that restoring a saved placement after changing from open-tray height to closed-bar height keeps the same top y position.
- Window placement tests assert that reveal without a saved placement uses center instead of a drifted hidden position.

## 2026-02-26: NSPanel position drift on show + theme not updating

**Symptom**: The input bar would sometimes appear near the bottom of the screen instead of centered. Happened intermittently after hiding the window while the tray was open. Separately, switching system theme (dark↔light) while the window was hidden didn't take effect on next show.

**Root cause (position)**: Two things conspired:
1. `close_tray` resized the hidden NSPanel (shrinking height). macOS responded by shifting the y-position down by the height difference (anchoring the bottom edge). `set_position` after `set_size` didn't reliably stick on hidden panels.
2. `reposition_to_cursor_monitor` had a "same monitor, skip" early return. Since the drifted window was still on the same monitor, the bad position was preserved.

Fix #1 alone (deferring resize while hidden + `sync_tray_size` on show) wasn't enough because the NSPanel position also drifted between hide/show for other reasons (e.g. system appearance changes). The real fix was removing the same-monitor skip entirely so the window always re-centers when shown.

**Root cause (theme)**: `window.matchMedia('prefers-color-scheme: dark')` `change` events don't fire inside a hidden NSPanel. So if the system theme changed while hidden, `systemPrefersDark` stayed stale.

**Fix (position)**: Three changes in `main.rs`:
- `open_tray`/`close_tray`: skip resize when window is hidden, only update `currently_open` flag
- New `sync_tray_size` helper: applies deferred resize before showing (safety net)
- `reposition_to_cursor_monitor`: always reposition — removed the same-monitor early return

**Fix (theme)**: In `App.svelte`, added a `main_hide_unhide` listener that re-checks `mediaQuery.matches` on every `unhide` event.
