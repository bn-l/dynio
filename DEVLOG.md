# Devlog

## 2026-10-04: The status bar disappeared when a list gave way to "No output"

**Symptom**: In find, typing `ukr` and then deleting the "r" sometimes made the panel jump. The list (and its scrollbar) gave way to "No output", and at the same moment the status bar disappeared, so the content area grew by 45 px and everything recentred. Typing `uk` straight away showed "No output" with "esc to clear" in the status bar, so the panel looked different depending on how you got there.

**Root cause**: when the output empties, a reactive block in `App.svelte` puts up "esc to clear". Svelte then destroys `ListDisplay`, whose `onDestroy` cleared the status bar whatever was in it, wiping App's hint. With nothing in it, `Tray` hides the status bar. `SingleDisplay` and `CmdSelector` had the same `onDestroy`.

**Not the cause**: the scrollbar. `overflow-y: scroll` keeps its space whether or not the list can scroll. I checked in a real WKWebView at the window's size, with both macOS scroll bar styles (macOS switches between them when a mouse is connected): the content width doesn't change, and a list going from scrolling to fitting doesn't move its rows (compared pixel by pixel).

**Fix**: each of the three components remembers the status it last set and, when it's destroyed, clears the status bar only if it still shows that (`clearStatusBarIfShowing` in `globals.ts`).

**Tests** (not run yet):
- New in `tests/App.test.ts`: "keeps "esc to clear" when a list gives way to no output". It fails on the old code.
- The three "clears status bar on destroy" tests (ListDisplay, SingleDisplay, CmdSelector) set a status the component hadn't set and expected it to be cleared, which is the bug. Each is now two tests: the component clears its own status, and it leaves one that was set after it.

## 2026-10-04: Stopping a command left the programs it started running

**Symptom**: My find command starts a new search on every keystroke, and the searches it replaced kept going. dynio stopped the script, but its `mdfind` and `fzf` ran on to the end, so typing `settings` left up to six Spotlight searches competing with the one being shown. Any script with a pipeline did the same; the README's to-mp4 example kept converting after Esc.

**Root cause**: `run_program` stopped a command with `child.kill()`, which only SIGKILLs the process it started. The programs that process started were left running.

**Fix**: each command now runs in its own process group (`process_group(0)`), and `stop_child` signals the whole group. It sends SIGTERM first, so scripts can clean up with `trap`, then SIGKILL if the command is still running after `STOP_GRACE` (5 s). Windows has no process groups, so there it still kills just the command.

**Why not SIGKILL the group straight away**: SIGKILL can't be caught. My srconv script relied on only ffmpeg being killed: its progress reader was a separate process that survived, noticed, and deleted the half-written file. Killing the whole group outright would have left those files behind. Now srconv deletes the file in a `trap`. The grace is 5 s because ffmpeg takes about 1.3 s to finish writing after SIGTERM (x264 `veryslow`).

**Gotchas**:
- The group has to be created when the command starts. Otherwise the command is in dynio's own group, and signalling "its group" stops dynio.
- macOS returns EPERM from `killpg` when everything in the group has exited but the command hasn't been waited for yet, so `stop_child` ignores errors.
- bash postpones a trap until the command it's running in the foreground finishes, so srconv starts ffmpeg with `&`, `wait`s for it, and its trap kills ffmpeg straight away.
- srconv's new version needs this dynio. With an older one, stopping srconv kills only bash and ffmpeg converts to the end.

**Tests** (`src-tauri/src/tests/stop_running.rs`, `process_group`), not run yet:
- Through the real `run_program` and `stop_running`: a `sleep` the script started in the background is stopped too, and a script's `trap ... TERM` runs.
- `stop_child` kills a command that ignores SIGTERM once the grace period is up, and returns at once for a command that has already exited.

## 2026-10-03: Cmd+O ran the activate action on the folder instead of opening it

**Symptom**: With `isPath: true`, Cmd/Ctrl+O (and right-click in list mode) is documented as "open containing folder", but it only did that for `activateAction: open`. With `copy` it copied the folder's path. With `command` it ran the command with the folder as its argument. That was dangerous for a command that deletes its argument: a "move the original to the Trash" command would have been handed the folder.

**Root cause**: `activate()` replaced the text with its parent folder (`trim_path`) and then did the configured action with it, the same as for Enter.

**Fix**: when `openContaining` is set, `activate()` always opens the folder with `openPath` and skips the action.

**Behaviour change**: in my find command (`activateAction: command`, the frecency script), Cmd+O used to run that script on the folder, which recorded the folder as opened and then opened it. Now it just opens the folder.

**Tests** (`tests/lib/utils/activator.test.ts`): two tests asserted the old behaviour and now assert the new one. "passes trimmed path to copy action" is now "opens the folder for the copy action too", and "passes parent directory to command" is now "opens the folder instead of running the command", which also checks that `spawn_detached` isn't called.

## 2026-10-03: Cmd+Enter also re-ran runOnEnter commands

**Symptom**: For a command with `runOnEnter`, Cmd/Ctrl+Enter (activate the output) also started the command again. In the README's `to_mp4` example, Cmd+Enter opened the converted file and restarted the conversion, which overwrote that file. Found while planning a "Cmd+Enter moves the original to the Trash" action for a screen recording converter, where the re-run would convert the file being trashed.

**Root cause**: `Input.svelte`'s keydown handler ran the command on any Enter without looking at modifier keys. The same keypress then bubbled up to the display's Cmd+Enter handler on `<body>`, which activated the output, so both happened (the re-run 30 ms later, after the debounce).

**Fix**: the input only runs the command on plain Enter (`!event.metaKey && !event.ctrlKey`, matching the displays' `CmdOrCtrl`).

**Regression tests** (`tests/Bar/Input.test.ts`): with `runOnEnter`, Cmd+Enter and Ctrl+Enter don't call `run_program`.

**Related, not fixed**: the `hotkeys` action doesn't check that modifiers it wasn't given are *up*, so a handler for plain Enter also fires on Cmd+Enter. Without `runOnEnter`, Cmd+Enter therefore activates twice in single mode (the Enter and the Cmd+Enter handler). It's harmless for copy/open, but a `command` action runs twice.

## 2026-10-02: macOS privacy permissions lost on every update

**Symptom**: After an update, commands using Spotlight (`mdfind`) stopped finding files in Desktop, Documents and Downloads. There was no prompt and no error, just fewer results. Touching those folders from a command (`ls ~/Desktop ...`) brought the prompts back, but only until the next update.

**Root cause**: Release builds were only linker-signed (ad-hoc). macOS identifies an ad-hoc app by a hash of that exact build, and stores that hash with each privacy permission it grants. Every new build has a new hash, so the old grants stopped applying. `mdfind` never triggers a prompt: Spotlight just leaves out results the app isn't allowed to see. TCC.db had the grants pinned to `cdhash d601b0bc…` while the installed 1.7.0 was `cdhash 759e7a85…`.

**Fix**: Releases are still ad-hoc signed. Only my own install is re-signed, with my local self-signed certificate ("Local Dev Signing"), after every `brew install` / `brew upgrade`:
- `just sign-installed` quits the installed app if it's running, signs `/Applications/dynio.app`, and reopens it if it was running. The app's code identity is then `identifier "com.dynio.net" and certificate root = H"2b4e4707…"`, the same for every build, so permissions granted once carry over to later versions.
- Permissions have to be granted *after* signing, because macOS stores the identity the app had at the time. dynio only gets Desktop, Documents and Downloads (Files & Folders), not Full Disk Access. Files & Folders entries can't be added by hand in System Settings; they only appear after the app asks. My find script (`~/.config/dynio/scripts/custom-find.sh`) has a commented-out `ls` of the three folders for this. I uncommented it, did one search, allowed the three prompts (stored against the certificate, not the build), and commented it out again. That's back to the old setup, except it no longer needs redoing after every update.
- `src-tauri/Info.plist` (merged by Tauri) adds usage descriptions for Desktop, Documents, Downloads, removable and network drives, so the prompts say why.

**Decisions**:
- **Signing is for my machine only.** CI doesn't sign anything. Other people who install dynio get the ad-hoc build and lose permissions on each update, as before. They can sign their own install with their own certificate (`just sign-installed "<their identity>"`) or re-grant after each update.
- **The certificate isn't backed up.** If it's ever lost or replaced, there's nothing to recover: sign with whatever certificate there is now, then grant the permissions again (`tccutil reset All com.dynio.net`, then uncomment the `ls` line in the find script, do one search, allow the three prompts and comment it out again).

**Gotchas**:
- If I forget to re-sign after an upgrade, the original symptom comes back: no error, just missing results (the unsigned build is a different app to macOS). Running `just sign-installed` fixes it without re-granting, because nothing asked, so the stored permissions were never touched. dynio's built-in updater is disabled (`App.svelte`), so Homebrew is the only thing that replaces the app.
- `signingIdentity: "-"` (ad-hoc, what Tauri's docs suggest without an Apple account) doesn't help. An ad-hoc identity is always the build hash.
- If CI signing is ever wanted with a self-signed certificate, Tauri's own `APPLE_CERTIFICATE` import can't be used. After importing, it only looks for Apple-issued certificate names (`Developer ID Application:`, `Apple Development:`, ...) and fails on a self-signed one. The workflow would have to import the certificate into a keychain itself and pass only `APPLE_SIGNING_IDENTITY`.
- Dev builds (`just dev`) are separate apps as far as permissions go, so they won't see protected folders.

**Checked**: two copies of the app with different build hashes, signed with the same certificate, had the same code identity and passed `codesign --verify --strict`.

## 2026-10-02: Single mode squashed output onto one line

**Symptom**: Multi-line output in single mode showed as one paragraph. Lines "one", "two" and "three" read "one two three", and pretty-printed JSON (`json: true` without `jsonPath`) lost its line breaks and indentation. Found while making the ffmpeg demo, whose progress is one line per step.

**Root cause**: `processSingleOutput` joins the lines with `\n`, but the text is shown in a normal `<div>`, which collapses newlines and runs of spaces like any HTML text.

**Fix**: `white-space: pre-wrap` on `#singleDisplay` (as `Stderr.svelte` already had). Checked in WebKit: three lines now take three line-heights. No unit test, since jsdom doesn't lay out text.

**Gotcha found at the same time**: single mode's `json` option defaults to `true` (schema), so a command with plain-text output needs `json: false` or every run logs "JSON Parse error". The README examples set it.

## 2026-10-02: Window not centred on launch

**Symptom**: On launch the bar appeared off-centre, wherever it had last been dragged, instead of in the middle of the screen.

**Root cause**: Since 2026-05-30, drag positions were written to `window-placement.yaml` and restored on launch as well as on reveal. One drag moved every later launch, including across the dev build and the installed app, which share the file. Separately, when there was no drag position (or `reshowInCenter` was on), reveal centred the window at its *current* height. With the tray still open, that centred the tall window and put the bar about 158pt higher than usual.

**Fix**:
- Drag positions are kept in memory only (`WindowPlacementStore` managed state). Every launch starts centred, and drags are remembered until quit. `window-placement.yaml` is no longer read or written.
- `show_position_for_monitor` takes the closed bar size and the real window size separately. Centring always uses the bar; the real size is only used to keep the window on screen.
- Startup calls the same function with no drag position, so launch → hide → show doesn't jump.
- `setup_main_window` now logs where it put the window. Startup wasn't logged before, which made this hard to diagnose.

**Regression tests** (`tests/window.rs`):
- The centred bar lands in the same place whether the tray is open or closed.
- `reshowInCenter` centres the bar, not the open tray.
- A centred open tray is moved up to stay on a short monitor.

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
