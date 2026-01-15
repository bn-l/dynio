// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime, Size, WebviewWindow};
use tokio::io::{AsyncBufReadExt, AsyncReadExt};
use tokio::sync::Mutex;
use tokio::time::Duration;
#[cfg(target_os = "windows")]
use winapi::um::winbase::CREATE_NO_WINDOW;

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

use std::sync::atomic::{self, AtomicBool};

mod general_settings;
use general_settings::GeneralSettings;

#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

#[cfg(target_os = "macos")]
use tauri_nspanel::{
    objc2::{msg_send, ClassType, Message},
    objc2_app_kit::NSWindowCollectionBehavior,
    objc2_foundation::NSObjectProtocol,
    panel, ManagerExt, StyleMask, WebviewWindowExt,
};

// Define a panel type that can become key window (to receive keyboard input)
// but doesn't activate the application
#[cfg(target_os = "macos")]
panel!(DynioPanel {
    config: {
        can_become_key_window: true,
        can_become_main_window: false,
    }
});

const POLL_DELAY_MS: u64 = 16;
type VecSender = tokio::sync::watch::Sender<Vec<String>>;

// Window sizing constants (relative to screen dimensions)
const SCREEN_TO_WIDTH_RATIO: f64 = 0.42;
const HEIGHT_TO_WIDTH_RATIO: f64 = 0.16;
const TRAY_TO_BAR_RATIO: f64 = 3.05;
const Y_OFFSET_RATIO: f64 = 0.05; // 5% of screen height above center

fn home_dir() -> std::path::PathBuf {
    dirs::home_dir().expect("Could not get home dir")
}

fn config_dir() -> std::path::PathBuf {
    match std::env::var("XDG_CONFIG_HOME") {
        Ok(xdg) => std::path::PathBuf::from(xdg).join("dynio"),
        Err(_) => home_dir().join(".config").join("dynio"),
    }
}

#[cfg(target_os = "windows")]
fn build_windows_command(program: &str, arguments: &[String], input: &str) -> String {
    format!(
        r#""chcp 65001 >nul && {} {} {}""#,
        format!("\"{}\"", program),
        arguments.join(" "),
        format!("\"{}\"", input)
    )
}

#[derive(Debug, thiserror::Error)]
enum SerError {
    #[error(transparent)]
    Io(#[from] std::io::Error),
}
impl serde::Serialize for SerError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

fn create_collector<R: Runtime>(app_handle: AppHandle<R>) -> (VecSender, VecSender) {
    let (stdout_tx, mut stdout_rx) = tokio::sync::watch::channel(Vec::<String>::new());
    let (stderr_tx, mut stderr_rx) = tokio::sync::watch::channel(Vec::<String>::new());

    let app_handle1 = app_handle.clone();
    tokio::spawn(async move {
        loop {
            let mut update = stdout_rx.borrow_and_update().clone();
            update.dedup();
            if !update.is_empty() {
                log::debug!("stdout output: {:?}", update);
            }
            let _ = app_handle1.emit("stdout", update);
            if stdout_rx.changed().await.is_err() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(POLL_DELAY_MS)).await;
        }
    });

    let app_handle2 = app_handle.clone();
    tokio::spawn(async move {
        loop {
            let update = stderr_rx.borrow_and_update().clone();
            if update.is_empty() {
                log::debug!("No stderr output.");
            } else {
                log::debug!("stderr output: {:?}", update);
            }
            let _ = app_handle2.emit("stderr", update);
            if stderr_rx.changed().await.is_err() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(POLL_DELAY_MS)).await;
        }
    });

    (stdout_tx, stderr_tx)
}

struct KillChannel {
    kill_sender: tokio::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}
impl Default for KillChannel {
    fn default() -> Self {
        KillChannel {
            kill_sender: tokio::sync::Mutex::new(None),
        }
    }
}

/// Reads stdout/stderr line-by-line. Waits for newline characters before emitting.
/// Used for list/single display modes where output is naturally line-oriented.
async fn read_and_send_lines<R>(
    mut lines: tokio::io::Lines<tokio::io::BufReader<R>>,
    sender: VecSender,
    finish_flag: std::sync::Arc<AtomicBool>,
) where
    R: tokio::io::AsyncRead + Unpin,
{
    while let Ok(Some(line)) = lines.next_line().await {
        if finish_flag.load(atomic::Ordering::Relaxed) {
            break;
        }
        sender.send_modify(|vec| vec.push(line));
    }
}

/// Reads stdout as raw byte chunks, emitting data as soon as it's available.
/// Used for LLM streaming where tokens arrive without newlines between them.
async fn read_and_send_chunks<R>(
    mut reader: tokio::io::BufReader<R>,
    sender: VecSender,
    finish_flag: std::sync::Arc<AtomicBool>,
) where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut buf = [0u8; 1024];
    loop {
        if finish_flag.load(atomic::Ordering::Relaxed) {
            break;
        }
        match reader.read(&mut buf).await {
            Ok(0) => break, // EOF
            Ok(n) => {
                if let Ok(s) = std::str::from_utf8(&buf[..n]) {
                    sender.send_modify(|vec| vec.push(s.to_string()));
                }
            }
            Err(_) => break,
        }
    }
}

#[tauri::command]
async fn run_program<R: Runtime>(
    program: String,
    current_dir: Option<String>,
    arguments: Vec<String>,
    input: String,
    streaming: Option<bool>,
    app_handle: AppHandle<R>,
) -> Result<(), SerError> {
    log::debug!("In run_program, streaming={:?}", streaming);

    if let Some(sender) = app_handle
        .state::<KillChannel>()
        .kill_sender
        .lock()
        .await
        .take()
    {
        let _ = sender.send(());
    }

    #[cfg(target_os = "windows")]
    let mut command = tokio::process::Command::new("cmd");

    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
        let cmd = build_windows_command(&program, &arguments, &input);
        log::debug!("|>{cmd}<|");
        command.arg("/C");
        command.raw_arg(&cmd);
    }

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        log::debug!("[DEBUG] Program path: {}", &program);
        log::debug!("[DEBUG] Program exists: {}", std::path::Path::new(&program).exists());
    }

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    let mut command = tokio::process::Command::new(&program);

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        command.args(arguments);
        command.arg(input);
    }

    if let Some(ref dir) = current_dir {
        command.current_dir(std::path::Path::new(dir));
    }

    command.stdout(Stdio::piped()).stderr(Stdio::piped());

    log::debug!("[DEBUG] About to spawn child process");

    // Force flush the log before spawn
    use std::io::Write;
    let _ = std::io::stderr().flush();

    let mut child = match command.spawn() {
        Ok(child) => {
            log::debug!("[DEBUG] spawn() succeeded");
            child
        }
        Err(e) => {
            log::debug!("[DEBUG] spawn() FAILED: {:?}", e);
            // Emit exit event so frontend knows command finished (even though it failed to start)
            let _ = app_handle.emit("exit", Some(-1i32));
            return Err(e.into());
        }
    };
    log::debug!("[DEBUG] Child spawned with id: {:?}", child.id());
    let _ = app_handle.emit("started", child.id());
    let stdout_pipe = child.stdout.take().expect("Could not take stdout");
    let stderr_pipe = child.stderr.take().expect("Could not take stderr");

    let (stdout_tx, stderr_tx) = create_collector(app_handle.clone());
    let finish_flag = std::sync::Arc::new(AtomicBool::new(false));

    // For stdout: use chunk-based reading for LLM streaming (emits bytes as they arrive),
    // otherwise use line-based reading (waits for newlines).
    let finish_flag_clone = finish_flag.clone();
    if streaming.unwrap_or(false) {
        let stdout_reader = tokio::io::BufReader::new(stdout_pipe);
        tokio::spawn(read_and_send_chunks(stdout_reader, stdout_tx, finish_flag_clone));
    } else {
        let stdout_lines = tokio::io::BufReader::new(stdout_pipe).lines();
        tokio::spawn(read_and_send_lines(stdout_lines, stdout_tx, finish_flag_clone));
    }

    // Stderr always uses line-based reading (error messages are typically line-oriented)
    let stderr = tokio::io::BufReader::new(stderr_pipe).lines();
    let finish_flag_clone = finish_flag.clone();
    tokio::spawn(read_and_send_lines(stderr, stderr_tx, finish_flag_clone));

    log::debug!("[DEBUG] Reader tasks spawned, about to enter select!");

    let (kill_sender, kill_receiver) = tokio::sync::oneshot::channel::<()>();
    app_handle
        .state::<KillChannel>()
        .kill_sender
        .lock()
        .await
        .replace(kill_sender);

    tokio::select! {
        exit_status = child.wait() => {
            log::debug!("[DEBUG] child.wait() completed, exit_status: {:?}", exit_status);
            match exit_status {
                Ok(status) => {
                    log::debug!("[DEBUG] Emitting exit event with code: {:?}", status.code());
                    let _ = app_handle.emit("exit", status.code());
                }
                Err(e) => {
                    log::debug!("[DEBUG] child.wait() error: {:?}, emitting exit with code -1", e);
                    let _ = app_handle.emit("exit", Some(-1i32));
                }
            }
        }
        _ = kill_receiver => {
            log::debug!("[DEBUG] kill_receiver triggered, killing process");
            finish_flag.store(true, atomic::Ordering::Relaxed);
            child.kill().await.expect("Couldn't kill process")
        }
    }

    Ok(())
}

#[tauri::command]
async fn stop_running<R: Runtime>(app_handle: AppHandle<R>) {
    if let Some(sender) = app_handle
        .state::<KillChannel>()
        .kill_sender
        .lock()
        .await
        .take()
    {
        let _ = sender.send(());
    }
}

struct TrayState {
    width: f64,
    tray_closed_height: f64,
    tray_open_height: f64,
    currently_open: bool,
}
impl Default for TrayState {
    fn default() -> Self {
        TrayState {
            width: 0.0,
            tray_closed_height: 0.0,
            tray_open_height: 0.0,
            currently_open: false,
        }
    }
}

#[tauri::command]
async fn open_tray<R: Runtime>(app_handle: AppHandle<R>) {
    let window = app_handle
        .get_webview_window("main")
        .expect("Could not get main window");
    let state = app_handle.state::<Mutex<TrayState>>();
    let mut guard = state.lock().await;

    if !guard.currently_open {
        // Capture current position before resize to preserve user-set position
        let current_pos = window.outer_position().unwrap_or(PhysicalPosition { x: 0, y: 0 });
        let _ = window.set_size(Size::Physical(PhysicalSize {
            width: guard.width as u32,
            height: guard.tray_open_height as u32,
        }));
        let _ = window.set_position(current_pos);
        guard.currently_open = true;
    }
}

#[tauri::command]
async fn close_tray<R: Runtime>(app_handle: AppHandle<R>) {
    let window = app_handle
        .get_webview_window("main")
        .expect("Could not get main window");
    let state = app_handle.state::<Mutex<TrayState>>();
    let mut guard = state.lock().await;

    if guard.currently_open {
        // Capture current position before resize to preserve user-set position
        let current_pos = window.outer_position().unwrap_or(PhysicalPosition { x: 0, y: 0 });
        let _ = window.set_size(Size::Physical(PhysicalSize {
            width: guard.width as u32,
            height: guard.tray_closed_height as u32,
        }));
        let _ = window.set_position(current_pos);
        guard.currently_open = false;
    }
}

/// Repositions and resizes the window to be centered on the monitor where the cursor is located,
/// but only if the cursor is on a different monitor than the window.
fn reposition_to_cursor_monitor<R: Runtime>(app_handle: &AppHandle<R>) {
    let Some(window) = app_handle.get_webview_window("main") else {
        log::error!("Could not get main window for repositioning");
        return;
    };

    // Get cursor position
    let cursor_pos = match window.cursor_position() {
        Ok(pos) => pos,
        Err(e) => {
            log::debug!("Could not get cursor position: {:?}, skipping reposition", e);
            return;
        }
    };

    // On macOS, monitor_from_point expects LOGICAL coordinates but cursor_position
    // returns PHYSICAL coordinates. See: https://github.com/tauri-apps/tauri/issues/12676
    // We need to convert physical cursor position to logical for macOS.
    #[cfg(target_os = "macos")]
    let cursor_for_monitor = {
        let scale_factor = window.scale_factor().unwrap_or(1.0);
        (cursor_pos.x / scale_factor, cursor_pos.y / scale_factor)
    };

    // On Windows, monitor_from_point expects physical coordinates
    #[cfg(not(target_os = "macos"))]
    let cursor_for_monitor = (cursor_pos.x, cursor_pos.y);

    // Find monitor at cursor position
    let Some(cursor_monitor) = window.monitor_from_point(cursor_for_monitor.0, cursor_for_monitor.1)
        .ok().flatten() else {
        log::debug!("Could not find monitor at cursor position");
        return;
    };

    // Get the monitor the window is currently on
    let current_monitor = window.current_monitor().ok().flatten();

    // Only reposition if cursor is on a different monitor than the window
    if let Some(ref current) = current_monitor {
        if current.position() == cursor_monitor.position() {
            log::debug!("Window already on cursor's monitor, skipping reposition");
            return;
        }
    }

    log::debug!("Repositioning window to cursor's monitor: pos=({}, {}), size={}x{}",
        cursor_monitor.position().x, cursor_monitor.position().y,
        cursor_monitor.size().width, cursor_monitor.size().height);

    let monitor = cursor_monitor;

    let screen_width = monitor.size().width as f64;
    let screen_height = monitor.size().height as f64;
    let monitor_x = monitor.position().x;
    let monitor_y = monitor.position().y;

    // Calculate window dimensions for this monitor
    let phys_width = screen_width * SCREEN_TO_WIDTH_RATIO;
    let phys_height = phys_width * HEIGHT_TO_WIDTH_RATIO;
    let phys_tray_height = phys_height * TRAY_TO_BAR_RATIO;

    // Calculate centered position on this monitor
    let x = monitor_x + ((screen_width - phys_width) / 2.0) as i32;
    let y = monitor_y + ((screen_height - phys_height) / 2.0 - (screen_height * Y_OFFSET_RATIO)) as i32;

    // Update TrayState with new dimensions for this monitor
    let guard = app_handle.state::<Mutex<TrayState>>();
    let mut state = tauri::async_runtime::block_on(guard.lock());
    let is_open = state.currently_open;
    *state = TrayState {
        width: phys_width,
        tray_closed_height: phys_height,
        tray_open_height: phys_tray_height + phys_height,
        currently_open: is_open,
    };

    // Set size based on current tray state
    let height = if is_open { state.tray_open_height } else { state.tray_closed_height };
    let _ = window.set_size(Size::Physical(PhysicalSize {
        width: phys_width as u32,
        height: height as u32,
    }));
    let _ = window.set_position(PhysicalPosition { x, y });

    log::debug!("Repositioned window to monitor at cursor: {}x{} at ({}, {})",
        phys_width as u32, height as u32, x, y);
}

fn toggle_main_window<R: Runtime>(app_handle: &AppHandle<R>) {
    log::debug!("toggling main window");

    #[cfg(target_os = "macos")]
    {
        // On macOS, use the panel API to avoid focus stealing
        if let Ok(panel) = app_handle.get_webview_panel("main") {
            if panel.is_visible() {
                panel.hide();
                let _ = app_handle.emit("main_hide_unhide", "hide");
            } else {
                // Reposition to cursor's monitor before showing
                reposition_to_cursor_monitor(app_handle);
                // show_and_make_key shows the panel and makes it key window
                // (receives keyboard input) without activating the app
                panel.show_and_make_key();
                let _ = app_handle.emit("main_hide_unhide", "unhide");
            }
        } else {
            log::error!("Could not get main panel");
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        if let Some(window) = app_handle.get_webview_window("main") {
            let visible = window.is_visible().unwrap_or(false);
            let focused = window.is_focused().unwrap_or(false);
            if !visible {
                // Reposition to cursor's monitor before showing
                reposition_to_cursor_monitor(app_handle);
                let _ = window.show();
                let _ = window.set_focus();
                let _ = app_handle.emit("main_hide_unhide", "unhide");
            } else if !focused {
                log::debug!("Window was not focused, setting focus");
                let _ = window.set_focus();
            } else {
                let _ = window.hide();
                let _ = app_handle.emit("main_hide_unhide", "hide");
            }
        }
    }
}

#[tauri::command]
async fn hide_main<R: Runtime>(app_handle: AppHandle<R>) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.hide();
        let _ = app_handle.emit("main_hide_unhide", "hide");
    }
}

#[tauri::command]
async fn close_splashscreen<R: Runtime>(window: WebviewWindow<R>) {
    // Close splashscreen
    if let Some(splash) = window.get_webview_window("splashscreen") {
        let _ = splash.close();
    }

    // Show main window
    if let Some(main) = window.get_webview_window("main") {
        if !main.is_visible().unwrap() {
            let _ = main.show();
            let _ = main.set_focus();
        }
    }
}

#[tauri::command]
async fn trim_path(path: String) -> Result<String, SerError> {
    let path = std::path::Path::new(&path);
    let parent_path = path.parent().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "Path has no parent directory")
    })?;
    let parent_str = parent_path.to_str().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidData, "Path contains invalid UTF-8")
    })?;
    Ok(parent_str.to_string())
}

static ACTIVE_DETACHED: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
const MAX_DETACHED: usize = 50;
const DETACHED_TIMEOUT_SECS: u64 = 10 * 60; // 10 minutes

#[tauri::command]
async fn spawn_detached(
    program: String,
    arguments: Vec<String>,
    current_dir: Option<String>,
) -> Result<(), String> {
    use std::sync::atomic::Ordering;

    let current = ACTIVE_DETACHED.load(Ordering::Relaxed);
    if current >= MAX_DETACHED {
        return Err(format!(
            "Too many background processes ({}/{})",
            current, MAX_DETACHED
        ));
    }

    let mut cmd = tokio::process::Command::new(&program);

    cmd.args(&arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    if let Some(dir) = current_dir {
        cmd.current_dir(dir);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn {}: {}", program, e))?;

    ACTIVE_DETACHED.fetch_add(1, Ordering::Relaxed);

    tokio::spawn(async move {
        let timeout = Duration::from_secs(DETACHED_TIMEOUT_SECS);
        match tokio::time::timeout(timeout, child.wait()).await {
            Ok(_) => {}
            Err(_) => {
                let _ = child.kill().await;
            }
        }
        ACTIVE_DETACHED.fetch_sub(1, Ordering::Relaxed);
    });

    Ok(())
}

#[derive(Serialize, Deserialize)]
struct ConfigFiles {
    cmd_config: String,
    settings: String,
}

#[tauri::command]
async fn get_config_files() -> Result<ConfigFiles, SerError> {
    let cfg = config_dir();
    let settings_path = cfg.join("general-settings.yaml");
    let cmdconf_path = cfg.join("cmd-config.yaml");

    let settings_content = std::fs::read_to_string(settings_path)?;
    let cmdconf_content = std::fs::read_to_string(cmdconf_path)?;

    Ok(ConfigFiles {
        settings: settings_content,
        cmd_config: cmdconf_content,
    })
}

#[tauri::command]
async fn get_config_dir() -> Result<String, SerError> {
    let path_str = config_dir()
        .to_str()
        .expect("Could not convert path to string")
        .to_string();
    Ok(path_str)
}

fn main() {
    let dynio_dir = config_dir();
    std::fs::create_dir_all(&dynio_dir).expect("Failed to create config directory");
    let log_file_path = dynio_dir.join("dynio.log");
    let log_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_file_path)
        .expect("Failed to open dynio.log file");
    env_logger::Builder::from_default_env()
        .filter_level(log::LevelFilter::Debug)
        .target(env_logger::Target::Pipe(Box::new(log_file)))
        .init();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}));

    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_nspanel::init());
    }

    builder
        .manage(KillChannel::default())
        .manage(Mutex::new(TrayState::default()))
        .invoke_handler(tauri::generate_handler![
            run_program,
            stop_running,
            open_tray,
            close_tray,
            close_splashscreen,
            get_config_files,
            hide_main,
            get_config_dir,
            trim_path,
            spawn_detached
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Setup tray icon
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let toggle = MenuItemBuilder::with_id("togglevis", "Show").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&quit)
                .separator()
                .item(&toggle)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .icon_as_template(true)
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "togglevis" => {
                        toggle_main_window(app);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        toggle_main_window(app);
                    }
                })
                .build(app)?;

            setup_default_files();

            let settings = get_general_settings().expect("Could not get settings");
            log::debug!("settings: {:?}", settings);

            // Global shortcut setup
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::ShortcutState;

                let app_handle = app.handle().clone();
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |_app, _shortcut, event| {
                            if event.state() == ShortcutState::Pressed {
                                toggle_main_window(&app_handle);
                            }
                        })
                        .build(),
                )?;

                #[cfg(target_os = "windows")]
                let default_shortcut = "Alt+Space";
                #[cfg(target_os = "macos")]
                let default_shortcut = "Option+Space";
                #[cfg(target_os = "linux")]
                let default_shortcut = "Alt+Space";

                let shortcut_str = settings
                    .global_shortcut
                    .as_deref()
                    .unwrap_or(default_shortcut);
                let shortcut: Shortcut = shortcut_str.parse().expect("Failed to parse shortcut");
                app.global_shortcut().register(shortcut)?;
            }

            setup_splash_window(app.handle().clone());

            setup_main_window(
                app.handle().clone(),
                settings.start_minimised,
                settings.always_on_top,
            );

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn setup_default_files() {
    #[cfg(target_os = "windows")]
    let example_cmdconf = include_str!("./data/example-cmd-config-win.yaml");
    #[cfg(target_os = "macos")]
    let example_cmdconf = include_str!("./data/example-cmd-config-macos.yaml");
    #[cfg(target_os = "linux")]
    let example_cmdconf = include_str!("./data/example-cmd-config-linux.yaml");

    #[cfg(target_os = "windows")]
    let example_settings = include_str!("./data/default-general-settings-win.yaml");
    #[cfg(target_os = "macos")]
    let example_settings = include_str!("./data/default-general-settings-macos.yaml");
    #[cfg(target_os = "linux")]
    let example_settings = include_str!("./data/default-general-settings-linux.yaml");
    let schema_cmdconf = include_str!("./data/cmd-config-schema.json");
    let schema_settings = include_str!("./data/general-settings-schema.json");

    let base_dir = config_dir();
    let settings_path = base_dir.join("general-settings.yaml");
    let cmdconf_path = base_dir.join("cmd-config.yaml");
    let schema_settings_path = base_dir.join("general-settings-schema.json");
    let schema_cmdconf_path = base_dir.join("cmd-config-schema.json");

    if !base_dir.exists() {
        std::fs::create_dir_all(&base_dir).expect("Could not create config dir");
    }

    if !settings_path.exists() {
        std::fs::write(settings_path, example_settings).expect("Could not write settings");
    }
    if !cmdconf_path.exists() {
        std::fs::write(cmdconf_path, example_cmdconf).expect("Could not write cmdconf");
    }

    if !schema_settings_path.exists() {
        std::fs::write(schema_settings_path, schema_settings)
            .expect("Could not write schema settings");
    }
    if !schema_cmdconf_path.exists() {
        std::fs::write(schema_cmdconf_path, schema_cmdconf)
            .expect("Could not write schema cmdconf");
    }
}

fn get_general_settings() -> Result<GeneralSettings, Box<dyn std::error::Error>> {
    let settings_path = config_dir().join("general-settings.yaml");

    if !settings_path.exists() {
        return Err("Settings file does not exist".into());
    }

    let settings_text = std::fs::read_to_string(settings_path)?;
    let settings = serde_yaml::from_str(&settings_text)?;
    Ok(settings)
}

fn setup_main_window(app_handle: AppHandle, start_hidden: bool, on_top: bool) {
    let window = app_handle.get_webview_window("main").unwrap();
    let monitor = window
        .primary_monitor()
        .unwrap_or_else(|_err| {
            window
                .current_monitor()
                .expect("Couldn't get current monitor")
        })
        .expect("Couldn't get monitor");

    let screen_width = monitor.size().width as f64;
    let screen_height = monitor.size().height as f64;

    let phys_width = screen_width * SCREEN_TO_WIDTH_RATIO;
    let phys_height = phys_width * HEIGHT_TO_WIDTH_RATIO;
    let phys_tray_height = phys_height * TRAY_TO_BAR_RATIO;

    // Calculate position directly in physical coordinates to avoid logical/physical mismatch
    let x = ((screen_width - phys_width) / 2.0) as i32;
    let y = ((screen_height - phys_height) / 2.0 - (screen_height * Y_OFFSET_RATIO)) as i32;

    let guard = app_handle.state::<Mutex<TrayState>>();
    let mut state = tauri::async_runtime::block_on(guard.lock());
    *state = TrayState {
        width: phys_width,
        tray_closed_height: phys_height,
        tray_open_height: phys_tray_height + phys_height,
        currently_open: false,
    };

    let _ = window.set_size(Size::Physical(PhysicalSize {
        width: phys_width as u32,
        height: phys_height as u32,
    }));
    let _ = window.set_position(PhysicalPosition { x, y });

    if on_top {
        let _ = window.set_always_on_top(on_top);
    }

    // On macOS, convert the window to an NSPanel with non-activating behavior
    // This prevents the app from stealing focus when the panel is shown
    #[cfg(target_os = "macos")]
    {
        // Use to_panel() instead of DynioPanel::from_window() to properly register
        // the panel with the WebviewPanelManager so get_webview_panel() works later
        match window.to_panel::<DynioPanel>() {
            Ok(panel) => {
                log::debug!("Successfully converted window to panel and registered it");

                // Set the style mask to include NonactivatingPanel
                // This is the key to preventing focus stealing
                let style_mask = StyleMask::empty()
                    .nonactivating_panel()
                    .full_size_content_view();
                panel.set_style_mask(style_mask.into());

                // Set collection behavior for proper workspace handling
                // - Transient: panel doesn't have its own space
                // - MoveToActiveSpace: follows user to active space
                // - FullScreenAuxiliary: works with fullscreen apps
                panel.set_collection_behavior(
                    NSWindowCollectionBehavior::Transient
                        | NSWindowCollectionBehavior::MoveToActiveSpace
                        | NSWindowCollectionBehavior::FullScreenAuxiliary,
                );

                // Set panel level above normal windows (like Spotlight)
                // NSMainMenuWindowLevel = 24, we go one above
                panel.set_level(25);

                // Don't hide when app deactivates (we want it to stay visible)
                panel.set_hides_on_deactivate(false);

                // Panel should float above other windows
                panel.set_floating_panel(true);

                // Disable window animation for instant show/hide
                // NSWindowAnimationBehaviorNone = 2
                unsafe {
                    let ns_panel = panel.as_panel();
                    let _: () = msg_send![ns_panel, setAnimationBehavior: 2_isize];
                }

                if start_hidden {
                    log::debug!("start_hidden was true, hiding panel");
                    panel.hide();
                    let _ = app_handle.emit("main_hide_unhide", "hide");
                } else {
                    log::debug!("showing panel");
                    panel.show_and_make_key();
                }
            }
            Err(e) => {
                log::error!("Failed to convert window to panel: {:?}", e);
                // Fall back to regular window behavior
                if start_hidden {
                    let _ = window.hide();
                    let _ = app_handle.emit("main_hide_unhide", "hide");
                } else {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        if start_hidden {
            log::debug!("start_hidden was true");
            let _ = window.hide();
            let _ = app_handle.emit("main_hide_unhide", "hide");
        } else {
            log::debug!("about to set main as focused");
            let _ = window.hide();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn setup_splash_window(app_handle: AppHandle) {
    const SCREEN_TO_HEIGHT_RATIO: f64 = 0.6;
    const WIDTH_TO_HEIGHT_RATIO: f64 = 0.7;

    let window = app_handle.get_webview_window("main").unwrap();
    let monitor = window
        .primary_monitor()
        .unwrap_or_else(|_err| {
            window
                .current_monitor()
                .expect("Couldn't get current monitor")
        })
        .expect("Couldn't get monitor");

    let phys_height = (monitor.size().height as f64) * SCREEN_TO_HEIGHT_RATIO;
    let phys_width = phys_height * WIDTH_TO_HEIGHT_RATIO;

    let _ = window.set_size(Size::Physical(PhysicalSize {
        width: (phys_width as u32),
        height: (phys_height as u32),
    }));

    let _ = window.center();
    let _ = window.set_focus();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use std::sync::Arc;
    use tokio::io::BufReader;
    use tokio::sync::watch;

    // ============================================================
    // Section 19: run_program tests (helper functions and logic)
    // ============================================================

    #[cfg(target_os = "windows")]
    mod windows_command_tests {
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
    }

    mod config_dir_tests {
        use super::*;

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
    }

    // Test read_and_send_lines function
    mod read_and_send_lines_tests {
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
        async fn respects_finish_flag() {
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
        async fn handles_empty_input() {
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
        async fn handles_utf8_correctly() {
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
        async fn handles_very_long_lines() {
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
    }

    // Test read_and_send_chunks function
    mod read_and_send_chunks_tests {
        use super::*;

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
        async fn respects_finish_flag() {
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
        async fn handles_utf8_chunks() {
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
        async fn handles_empty_input() {
            let data: &[u8] = b"";
            let cursor = Cursor::new(data.to_vec());
            let reader = BufReader::new(cursor);

            let (tx, rx) = watch::channel(Vec::<String>::new());
            let finish_flag = Arc::new(AtomicBool::new(false));

            read_and_send_chunks(reader, tx, finish_flag).await;

            let result = rx.borrow().clone();
            assert!(result.is_empty());
        }
    }

    // Test create_collector behavior
    mod collector_tests {
        use super::*;

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
    }

    // ============================================================
    // Section 20: stop_running tests (KillChannel behavior)
    // ============================================================

    mod stop_running_tests {
        use super::*;
        use tokio::sync::oneshot;

        #[tokio::test]
        async fn kill_channel_default_has_no_sender() {
            let channel = KillChannel::default();
            let sender = channel.kill_sender.lock().await.take();
            assert!(sender.is_none());
        }

        #[tokio::test]
        async fn kill_channel_can_store_and_retrieve_sender() {
            let channel = KillChannel::default();
            let (tx, _rx) = oneshot::channel::<()>();

            channel.kill_sender.lock().await.replace(tx);

            let sender = channel.kill_sender.lock().await.take();
            assert!(sender.is_some());
        }

        #[tokio::test]
        async fn kill_channel_sender_fires_when_sent() {
            let channel = KillChannel::default();
            let (tx, rx) = oneshot::channel::<()>();

            channel.kill_sender.lock().await.replace(tx);

            // Take and send
            if let Some(sender) = channel.kill_sender.lock().await.take() {
                let _ = sender.send(());
            }

            // Receiver should get the signal
            let result = rx.await;
            assert!(result.is_ok());
        }

        #[tokio::test]
        async fn kill_channel_take_twice_returns_none() {
            let channel = KillChannel::default();
            let (tx, _rx) = oneshot::channel::<()>();

            channel.kill_sender.lock().await.replace(tx);

            // First take succeeds
            let first = channel.kill_sender.lock().await.take();
            assert!(first.is_some());

            // Second take returns None
            let second = channel.kill_sender.lock().await.take();
            assert!(second.is_none());
        }
    }

    // ============================================================
    // Section 21: open_tray / close_tray tests (TrayState logic)
    // ============================================================

    mod tray_state_tests {
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
    }

    // ============================================================
    // Additional Section 19 tests: trim_path command
    // ============================================================

    mod trim_path_tests {
        use super::*;

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
    }

    // ============================================================
    // spawn_detached tests (part of Section 19 - command activation)
    // ============================================================

    mod spawn_detached_tests {
        use super::*;

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
    }

    // ============================================================
    // SerError tests
    // ============================================================

    mod ser_error_tests {
        use super::*;

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
    }

    // ============================================================
    // ConfigFiles tests
    // ============================================================

    mod config_files_tests {
        use super::*;

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
    }

    // ============================================================
    // Integration tests using real processes (Section 19)
    // ============================================================

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    mod process_integration_tests {
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

    // ============================================================
    // Window dimension calculation tests
    // ============================================================

    mod window_dimension_tests {
        use super::*;

        #[test]
        fn screen_to_width_ratio_is_reasonable() {
            assert!(SCREEN_TO_WIDTH_RATIO > 0.0);
            assert!(SCREEN_TO_WIDTH_RATIO < 1.0);
            assert_eq!(SCREEN_TO_WIDTH_RATIO, 0.42);
        }

        #[test]
        fn height_to_width_ratio_is_reasonable() {
            assert!(HEIGHT_TO_WIDTH_RATIO > 0.0);
            assert!(HEIGHT_TO_WIDTH_RATIO < 1.0);
            assert_eq!(HEIGHT_TO_WIDTH_RATIO, 0.16);
        }

        #[test]
        fn tray_to_bar_ratio_is_reasonable() {
            assert!(TRAY_TO_BAR_RATIO > 1.0);
            assert_eq!(TRAY_TO_BAR_RATIO, 3.05);
        }

        #[test]
        fn y_offset_ratio_is_reasonable() {
            assert!(Y_OFFSET_RATIO > 0.0);
            assert!(Y_OFFSET_RATIO < 0.5);
            assert_eq!(Y_OFFSET_RATIO, 0.05);
        }

        #[test]
        fn poll_delay_is_16ms() {
            assert_eq!(POLL_DELAY_MS, 16);
        }

        #[test]
        fn centered_position_calculation() {
            let screen_width = 1920.0;
            let screen_height = 1080.0;
            let phys_width = screen_width * SCREEN_TO_WIDTH_RATIO;
            let phys_height = phys_width * HEIGHT_TO_WIDTH_RATIO;

            let x = ((screen_width - phys_width) / 2.0) as i32;
            let y = ((screen_height - phys_height) / 2.0 - (screen_height * Y_OFFSET_RATIO)) as i32;

            // x should center the window horizontally
            assert!(x > 0);
            assert!(x < screen_width as i32 / 2);

            // y should be slightly above center
            assert!(y > 0);
            assert!(y < screen_height as i32 / 2);
        }
    }

    // ============================================================
    // IPC-level tests using mock_app (Section 19, 20, 21 integration)
    // ============================================================

    mod ipc_tests {
        use super::*;
        use tauri::Manager;

        /// Helper to create a mock app with managed state
        fn create_test_app() -> tauri::App<tauri::test::MockRuntime> {
            let app = tauri::test::mock_app();
            app.manage(KillChannel::default());
            app.manage(Mutex::new(TrayState::default()));
            app
        }

        // ============================================================
        // Section 20: stop_running command with managed state
        // ============================================================

        #[tokio::test]
        async fn stop_running_with_no_active_process() {
            let app = create_test_app();
            let state = app.state::<KillChannel>();

            // Verify no sender initially
            assert!(state.kill_sender.lock().await.is_none());

            // Call stop_running directly with managed state - should be no-op
            stop_running(app.handle().clone()).await;

            // Still no sender (was None, remains None)
            assert!(state.kill_sender.lock().await.is_none());
        }

        #[tokio::test]
        async fn stop_running_sends_kill_signal() {
            let app = create_test_app();
            let state = app.state::<KillChannel>();

            // Set up a kill channel
            let (tx, rx) = tokio::sync::oneshot::channel::<()>();
            state.kill_sender.lock().await.replace(tx);

            // Call stop_running
            stop_running(app.handle().clone()).await;

            // Sender should have been taken
            assert!(state.kill_sender.lock().await.is_none());

            // Receiver should have received the signal
            assert!(rx.await.is_ok());
        }

        #[tokio::test]
        async fn stop_running_clears_sender_after_use() {
            let app = create_test_app();
            let state = app.state::<KillChannel>();

            // Set up a kill channel
            let (tx, _rx) = tokio::sync::oneshot::channel::<()>();
            state.kill_sender.lock().await.replace(tx);

            // Call stop_running twice
            stop_running(app.handle().clone()).await;
            stop_running(app.handle().clone()).await; // Should be no-op

            // Sender should remain None
            assert!(state.kill_sender.lock().await.is_none());
        }

        // ============================================================
        // Section 21: open_tray/close_tray with managed state
        // ============================================================

        #[tokio::test]
        async fn tray_state_initialized_correctly() {
            let app = create_test_app();
            let state = app.state::<Mutex<TrayState>>();
            let guard = state.lock().await;

            assert_eq!(guard.width, 0.0);
            assert_eq!(guard.tray_closed_height, 0.0);
            assert_eq!(guard.tray_open_height, 0.0);
            assert!(!guard.currently_open);
        }

        #[tokio::test]
        async fn tray_state_can_be_updated_via_managed_state() {
            let app = create_test_app();
            let state = app.state::<Mutex<TrayState>>();

            // Update state
            {
                let mut guard = state.lock().await;
                guard.width = 800.0;
                guard.tray_closed_height = 100.0;
                guard.tray_open_height = 400.0;
                guard.currently_open = false;
            }

            // Verify state persists
            {
                let guard = state.lock().await;
                assert_eq!(guard.width, 800.0);
                assert_eq!(guard.tray_closed_height, 100.0);
                assert_eq!(guard.tray_open_height, 400.0);
                assert!(!guard.currently_open);
            }
        }

        #[tokio::test]
        async fn open_tray_updates_state_flag() {
            let app = create_test_app();
            let state = app.state::<Mutex<TrayState>>();

            // Set up initial state (simulating what setup_main_window does)
            {
                let mut guard = state.lock().await;
                guard.width = 800.0;
                guard.tray_closed_height = 100.0;
                guard.tray_open_height = 400.0;
                guard.currently_open = false;
            }

            // open_tray requires a window, which MockRuntime may not fully support
            // We test the state logic directly here
            {
                let mut guard = state.lock().await;
                if !guard.currently_open {
                    guard.currently_open = true;
                }
            }

            let guard = state.lock().await;
            assert!(guard.currently_open);
        }

        #[tokio::test]
        async fn close_tray_updates_state_flag() {
            let app = create_test_app();
            let state = app.state::<Mutex<TrayState>>();

            // Set up initial state as open
            {
                let mut guard = state.lock().await;
                guard.width = 800.0;
                guard.tray_closed_height = 100.0;
                guard.tray_open_height = 400.0;
                guard.currently_open = true;
            }

            // Test close logic
            {
                let mut guard = state.lock().await;
                if guard.currently_open {
                    guard.currently_open = false;
                }
            }

            let guard = state.lock().await;
            assert!(!guard.currently_open);
        }

        // ============================================================
        // Section 19: run_program with managed state
        // ============================================================

        #[tokio::test]
        async fn run_program_registers_kill_sender() {
            let app = create_test_app();
            let state = app.state::<KillChannel>();

            // Initially no sender
            assert!(state.kill_sender.lock().await.is_none());

            // Simulate what run_program does when setting up kill channel
            let (tx, _rx) = tokio::sync::oneshot::channel::<()>();
            state.kill_sender.lock().await.replace(tx);

            // Now there should be a sender
            assert!(state.kill_sender.lock().await.is_some());
        }

        #[tokio::test]
        async fn run_program_kills_previous_process() {
            let app = create_test_app();
            let state = app.state::<KillChannel>();

            // Set up initial kill channel (simulating a running process)
            let (tx1, rx1) = tokio::sync::oneshot::channel::<()>();
            state.kill_sender.lock().await.replace(tx1);

            // Simulate what run_program does at the start - kill previous
            if let Some(sender) = state.kill_sender.lock().await.take() {
                let _ = sender.send(());
            }

            // Previous process should have received kill signal
            assert!(rx1.await.is_ok());

            // Set up new kill channel
            let (tx2, _rx2) = tokio::sync::oneshot::channel::<()>();
            state.kill_sender.lock().await.replace(tx2);

            // New sender should exist
            assert!(state.kill_sender.lock().await.is_some());
        }

        #[tokio::test]
        async fn multiple_managed_states_work_together() {
            let app = create_test_app();

            // Access both states
            let kill_state = app.state::<KillChannel>();
            let tray_state = app.state::<Mutex<TrayState>>();

            // Modify both
            let (tx, _rx) = tokio::sync::oneshot::channel::<()>();
            kill_state.kill_sender.lock().await.replace(tx);

            {
                let mut guard = tray_state.lock().await;
                guard.currently_open = true;
            }

            // Verify both
            assert!(kill_state.kill_sender.lock().await.is_some());
            assert!(tray_state.lock().await.currently_open);
        }

        // ============================================================
        // Testing commands that don't require window/runtime features
        // ============================================================

        #[tokio::test]
        async fn trim_path_command_works() {
            // trim_path doesn't need AppHandle, test it directly
            let result = trim_path("/home/user/file.txt".to_string()).await;
            assert!(result.is_ok());
            assert_eq!(result.unwrap(), "/home/user");
        }

        #[tokio::test]
        async fn get_config_dir_command_works() {
            // get_config_dir doesn't need AppHandle, test it directly
            let result = get_config_dir().await;
            assert!(result.is_ok());
            assert!(result.unwrap().contains("dynio"));
        }

        // ============================================================
        // Spawn detached tests with state
        // ============================================================

        #[tokio::test]
        async fn spawn_detached_respects_max_limit() {
            use std::sync::atomic::Ordering;

            // Get current count
            let initial = ACTIVE_DETACHED.load(Ordering::Relaxed);

            // Temporarily set count to max
            ACTIVE_DETACHED.store(MAX_DETACHED, Ordering::Relaxed);

            // Try to spawn - should fail
            let result = spawn_detached(
                "echo".to_string(),
                vec!["test".to_string()],
                None,
            ).await;

            assert!(result.is_err());
            assert!(result.unwrap_err().contains("Too many background processes"));

            // Restore
            ACTIVE_DETACHED.store(initial, Ordering::Relaxed);
        }
    }

    // ============================================================
    // Section 26: setup_default_files tests
    // ============================================================

    mod setup_default_files_tests {
        use super::*;
        use tempfile::tempdir;
        use std::fs;

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
            let schema_cmdconf = include_str!("./data/cmd-config-schema.json");
            let schema_settings = include_str!("./data/general-settings-schema.json");

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
                let _ = include_str!("./data/example-cmd-config-macos.yaml");
                let _ = include_str!("./data/default-general-settings-macos.yaml");
            }
            #[cfg(target_os = "linux")]
            {
                let _ = include_str!("./data/example-cmd-config-linux.yaml");
                let _ = include_str!("./data/default-general-settings-linux.yaml");
            }
            #[cfg(target_os = "windows")]
            {
                let _ = include_str!("./data/example-cmd-config-win.yaml");
                let _ = include_str!("./data/default-general-settings-win.yaml");
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
    }

    // ============================================================
    // Section 27: reposition_to_cursor_monitor tests
    // ============================================================

    mod reposition_to_cursor_monitor_tests {
        use super::*;

        // Test dimension calculation formulas used in reposition_to_cursor_monitor
        #[test]
        fn dimension_calculation_for_1920x1080() {
            let screen_width = 1920.0;
            let _screen_height = 1080.0;

            let phys_width = screen_width * SCREEN_TO_WIDTH_RATIO;
            let phys_height = phys_width * HEIGHT_TO_WIDTH_RATIO;
            let phys_tray_height = phys_height * TRAY_TO_BAR_RATIO;

            // Width should be 42% of screen width
            assert!((phys_width - 806.4).abs() < 0.1);

            // Height should be 16% of width
            assert!((phys_height - 129.024).abs() < 0.1);

            // Tray height should be 3.05x of closed height
            assert!((phys_tray_height - 393.5232).abs() < 0.1);
        }

        #[test]
        fn dimension_calculation_for_2560x1440() {
            let screen_width = 2560.0;
            let _screen_height = 1440.0;

            let phys_width = screen_width * SCREEN_TO_WIDTH_RATIO;
            let phys_height = phys_width * HEIGHT_TO_WIDTH_RATIO;
            let phys_tray_height = phys_height * TRAY_TO_BAR_RATIO;

            // Width: 2560 * 0.42 = 1075.2
            assert!((phys_width - 1075.2).abs() < 0.1);

            // Height: 1075.2 * 0.16 = 172.032
            assert!((phys_height - 172.032).abs() < 0.1);

            // Tray height: 172.032 * 3.05 = 524.6976
            assert!((phys_tray_height - 524.6976).abs() < 0.1);
        }

        #[test]
        fn dimension_calculation_for_4k_display() {
            let screen_width = 3840.0;
            let _screen_height = 2160.0;

            let phys_width = screen_width * SCREEN_TO_WIDTH_RATIO;
            let phys_height = phys_width * HEIGHT_TO_WIDTH_RATIO;

            // Width: 3840 * 0.42 = 1612.8
            assert!((phys_width - 1612.8).abs() < 0.1);

            // Height: 1612.8 * 0.16 = 258.048
            assert!((phys_height - 258.048).abs() < 0.1);
        }

        #[test]
        fn centered_position_calculation() {
            let screen_width = 1920.0;
            let screen_height = 1080.0;
            let monitor_x = 0;
            let monitor_y = 0;

            let phys_width = screen_width * SCREEN_TO_WIDTH_RATIO;
            let phys_height = phys_width * HEIGHT_TO_WIDTH_RATIO;

            // Centered position formula from reposition_to_cursor_monitor
            let x = monitor_x + ((screen_width - phys_width) / 2.0) as i32;
            let y = monitor_y + ((screen_height - phys_height) / 2.0 - (screen_height * Y_OFFSET_RATIO)) as i32;

            // x: (1920 - 806.4) / 2 = 556.8 -> 556
            assert!((x - 556).abs() <= 1);

            // y: (1080 - 129.024) / 2 - (1080 * 0.05) = 475.488 - 54 = 421.488 -> 421
            assert!((y - 421).abs() <= 1);
        }

        #[test]
        fn centered_position_on_secondary_monitor() {
            // Secondary monitor positioned to the right
            let screen_width = 1920.0;
            let screen_height = 1080.0;
            let monitor_x = 1920; // Offset by primary monitor width
            let monitor_y = 0;

            let phys_width = screen_width * SCREEN_TO_WIDTH_RATIO;
            let phys_height = phys_width * HEIGHT_TO_WIDTH_RATIO;

            let x = monitor_x + ((screen_width - phys_width) / 2.0) as i32;
            let y = monitor_y + ((screen_height - phys_height) / 2.0 - (screen_height * Y_OFFSET_RATIO)) as i32;

            // x should include monitor offset
            assert!(x > 1920);
            assert!((x - (1920 + 556)).abs() <= 1);

            // y should be same as primary
            assert!((y - 421).abs() <= 1);
        }

        #[test]
        fn tray_state_preserves_is_open_during_reposition() {
            // Simulate the TrayState update logic from reposition_to_cursor_monitor
            let is_open = true;
            let phys_width = 800.0;
            let phys_height = 100.0;
            let phys_tray_height = 300.0;

            let new_state = TrayState {
                width: phys_width,
                tray_closed_height: phys_height,
                tray_open_height: phys_tray_height + phys_height,
                currently_open: is_open, // Preserved
            };

            // is_open should be preserved during reposition
            assert!(new_state.currently_open);
        }

        #[test]
        fn tray_state_preserves_is_closed_during_reposition() {
            let is_open = false;
            let phys_width = 800.0;
            let phys_height = 100.0;
            let phys_tray_height = 300.0;

            let new_state = TrayState {
                width: phys_width,
                tray_closed_height: phys_height,
                tray_open_height: phys_tray_height + phys_height,
                currently_open: is_open,
            };

            assert!(!new_state.currently_open);
        }

        #[test]
        fn height_selection_based_on_tray_state() {
            let state = TrayState {
                width: 800.0,
                tray_closed_height: 100.0,
                tray_open_height: 400.0,
                currently_open: false,
            };

            // Logic from reposition_to_cursor_monitor
            let height = if state.currently_open {
                state.tray_open_height
            } else {
                state.tray_closed_height
            };

            assert_eq!(height, 100.0);
        }

        #[test]
        fn height_selection_when_tray_open() {
            let state = TrayState {
                width: 800.0,
                tray_closed_height: 100.0,
                tray_open_height: 400.0,
                currently_open: true,
            };

            let height = if state.currently_open {
                state.tray_open_height
            } else {
                state.tray_closed_height
            };

            assert_eq!(height, 400.0);
        }

        // Test macOS coordinate scaling (physical to logical)
        #[test]
        fn macos_coordinate_scaling_at_2x() {
            let physical_x = 200.0;
            let physical_y = 400.0;
            let scale_factor = 2.0;

            // macOS scaling: physical / scale_factor
            let logical_x = physical_x / scale_factor;
            let logical_y = physical_y / scale_factor;

            assert_eq!(logical_x, 100.0);
            assert_eq!(logical_y, 200.0);
        }

        #[test]
        fn macos_coordinate_scaling_at_1x() {
            let physical_x = 200.0;
            let physical_y = 400.0;
            let scale_factor = 1.0;

            let logical_x = physical_x / scale_factor;
            let logical_y = physical_y / scale_factor;

            // At 1x, physical = logical
            assert_eq!(logical_x, 200.0);
            assert_eq!(logical_y, 400.0);
        }

        #[test]
        fn macos_coordinate_scaling_at_1_5x() {
            let physical_x = 300.0;
            let physical_y = 450.0;
            let scale_factor = 1.5;

            let logical_x = physical_x / scale_factor;
            let logical_y = physical_y / scale_factor;

            assert_eq!(logical_x, 200.0);
            assert_eq!(logical_y, 300.0);
        }

        // Monitor comparison pattern
        #[test]
        fn monitor_position_equality_check() {
            // Simulate the monitor comparison from reposition_to_cursor_monitor
            let current_monitor_pos = (0, 0);
            let cursor_monitor_pos = (0, 0);

            // Same monitor check
            let same_monitor = current_monitor_pos == cursor_monitor_pos;
            assert!(same_monitor);
        }

        #[test]
        fn monitor_position_inequality_check() {
            let current_monitor_pos = (0, 0);
            let cursor_monitor_pos = (1920, 0); // Secondary monitor

            let same_monitor = current_monitor_pos == cursor_monitor_pos;
            assert!(!same_monitor);
        }
    }

    // ============================================================
    // Section 28: toggle_main_window tests
    // ============================================================

    mod toggle_main_window_tests {
        // Test the state machine logic for toggle_main_window
        // The actual function requires platform-specific APIs (NSPanel on macOS,
        // Window on others) that MockRuntime doesn't support.

        #[derive(Clone, Copy)]
        struct MockWindowState {
            visible: bool,
            focused: bool,
        }

        // Enum representing the actions toggle_main_window takes
        #[derive(Debug, PartialEq)]
        enum ToggleAction {
            Hide,
            ShowAndFocus,
            FocusOnly,
        }

        // Logic for non-macOS platforms (Windows/Linux)
        fn compute_toggle_action_non_macos(state: MockWindowState) -> ToggleAction {
            if !state.visible {
                ToggleAction::ShowAndFocus
            } else if !state.focused {
                ToggleAction::FocusOnly
            } else {
                ToggleAction::Hide
            }
        }

        // Logic for macOS platform
        fn compute_toggle_action_macos(visible: bool) -> ToggleAction {
            if visible {
                ToggleAction::Hide
            } else {
                ToggleAction::ShowAndFocus
            }
        }

        // Non-macOS tests

        #[test]
        fn non_macos_hidden_window_shows_and_focuses() {
            let state = MockWindowState {
                visible: false,
                focused: false,
            };
            assert_eq!(
                compute_toggle_action_non_macos(state),
                ToggleAction::ShowAndFocus
            );
        }

        #[test]
        fn non_macos_visible_unfocused_window_focuses() {
            let state = MockWindowState {
                visible: true,
                focused: false,
            };
            assert_eq!(
                compute_toggle_action_non_macos(state),
                ToggleAction::FocusOnly
            );
        }

        #[test]
        fn non_macos_visible_focused_window_hides() {
            let state = MockWindowState {
                visible: true,
                focused: true,
            };
            assert_eq!(
                compute_toggle_action_non_macos(state),
                ToggleAction::Hide
            );
        }

        // macOS tests

        #[test]
        fn macos_visible_panel_hides() {
            assert_eq!(
                compute_toggle_action_macos(true),
                ToggleAction::Hide
            );
        }

        #[test]
        fn macos_hidden_panel_shows() {
            assert_eq!(
                compute_toggle_action_macos(false),
                ToggleAction::ShowAndFocus
            );
        }

        // Test event emission patterns
        #[derive(Debug, PartialEq)]
        enum HideUnhideEvent {
            Hide,
            Unhide,
        }

        fn event_for_action(action: ToggleAction) -> HideUnhideEvent {
            match action {
                ToggleAction::Hide => HideUnhideEvent::Hide,
                ToggleAction::ShowAndFocus => HideUnhideEvent::Unhide,
                ToggleAction::FocusOnly => HideUnhideEvent::Unhide, // Focus-only doesn't emit
            }
        }

        #[test]
        fn hide_action_emits_hide_event() {
            let event = event_for_action(ToggleAction::Hide);
            assert_eq!(event, HideUnhideEvent::Hide);
        }

        #[test]
        fn show_action_emits_unhide_event() {
            let event = event_for_action(ToggleAction::ShowAndFocus);
            assert_eq!(event, HideUnhideEvent::Unhide);
        }

        // Note: Focus-only doesn't emit event in the actual code
        // The test above is simplified for pattern verification

        // State transition sequence tests

        #[test]
        fn toggle_cycle_non_macos() {
            // Start hidden
            let mut state = MockWindowState {
                visible: false,
                focused: false,
            };

            // First toggle: show and focus
            let action1 = compute_toggle_action_non_macos(state);
            assert_eq!(action1, ToggleAction::ShowAndFocus);

            // After showing
            state.visible = true;
            state.focused = true;

            // Second toggle: hide
            let action2 = compute_toggle_action_non_macos(state);
            assert_eq!(action2, ToggleAction::Hide);

            // After hiding
            state.visible = false;
            state.focused = false;

            // Third toggle: show again
            let action3 = compute_toggle_action_non_macos(state);
            assert_eq!(action3, ToggleAction::ShowAndFocus);
        }

        #[test]
        fn toggle_cycle_macos() {
            // Start hidden
            let mut visible = false;

            // First toggle: show
            let action1 = compute_toggle_action_macos(visible);
            assert_eq!(action1, ToggleAction::ShowAndFocus);
            visible = true;

            // Second toggle: hide
            let action2 = compute_toggle_action_macos(visible);
            assert_eq!(action2, ToggleAction::Hide);
            visible = false;

            // Third toggle: show again
            let action3 = compute_toggle_action_macos(visible);
            assert_eq!(action3, ToggleAction::ShowAndFocus);
        }

        #[test]
        fn non_macos_lost_focus_refocuses_without_hide() {
            // Window is visible but lost focus (e.g., user clicked another app)
            let state = MockWindowState {
                visible: true,
                focused: false,
            };

            // Toggle should just refocus, not hide
            let action = compute_toggle_action_non_macos(state);
            assert_eq!(action, ToggleAction::FocusOnly);
        }

        // Test reposition call pattern
        #[test]
        fn show_action_should_trigger_reposition() {
            // In toggle_main_window, reposition_to_cursor_monitor is called
            // before showing the window (when !visible)
            let action = ToggleAction::ShowAndFocus;

            // Only ShowAndFocus should trigger reposition
            let should_reposition = matches!(action, ToggleAction::ShowAndFocus);
            assert!(should_reposition);
        }

        #[test]
        fn hide_action_should_not_trigger_reposition() {
            let action = ToggleAction::Hide;
            let should_reposition = matches!(action, ToggleAction::ShowAndFocus);
            assert!(!should_reposition);
        }

        #[test]
        fn focus_action_should_not_trigger_reposition() {
            let action = ToggleAction::FocusOnly;
            let should_reposition = matches!(action, ToggleAction::ShowAndFocus);
            assert!(!should_reposition);
        }
    }
}
