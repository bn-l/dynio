// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Size, WebviewWindow};
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

fn create_collector(app_handle: AppHandle) -> (VecSender, VecSender) {
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
async fn run_program(
    program: String,
    current_dir: Option<String>,
    arguments: Vec<String>,
    input: String,
    streaming: Option<bool>,
    app_handle: AppHandle,
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
async fn stop_running(app_handle: AppHandle) {
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
async fn open_tray(app_handle: AppHandle) {
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
async fn close_tray(app_handle: AppHandle) {
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
fn reposition_to_cursor_monitor(app_handle: &AppHandle) {
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

fn toggle_main_window(app_handle: &AppHandle) {
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
async fn hide_main(app_handle: AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.hide();
        let _ = app_handle.emit("main_hide_unhide", "hide");
    }
}

#[tauri::command]
async fn close_splashscreen(window: WebviewWindow) {
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
