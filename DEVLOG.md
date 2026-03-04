# Devlog

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
