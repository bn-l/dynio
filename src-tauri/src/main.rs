// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Size, WebviewWindow};
use tokio::io::AsyncBufReadExt;
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
    objc2::{ClassType, Message},
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

#[tauri::command]
async fn run_program(
    program: String,
    current_dir: Option<String>,
    arguments: Vec<String>,
    input: String,
    app_handle: AppHandle,
) -> Result<(), SerError> {
    log::debug!("In run_program");

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
    let mut command = tokio::process::Command::new(program);

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        command.args(arguments);
        command.arg(input);
    }

    if let Some(ref dir) = current_dir {
        command.current_dir(std::path::Path::new(dir));
    }

    command.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = command.spawn()?;
    let _ = app_handle.emit("started", child.id());
    let stdout_pipe = child.stdout.take().expect("Could not take stdout");
    let stderr_pipe = child.stderr.take().expect("Could not take stderr");

    let stdout = tokio::io::BufReader::new(stdout_pipe).lines();
    let stderr = tokio::io::BufReader::new(stderr_pipe).lines();

    let (stdout_tx, stderr_tx) = create_collector(app_handle.clone());
    let finish_flag = std::sync::Arc::new(AtomicBool::new(false));

    let finish_flag_clone = finish_flag.clone();
    tokio::spawn(read_and_send_lines(stdout, stdout_tx, finish_flag_clone));

    let finish_flag_clone = finish_flag.clone();
    tokio::spawn(read_and_send_lines(stderr, stderr_tx, finish_flag_clone));

    let (kill_sender, kill_receiver) = tokio::sync::oneshot::channel::<()>();
    app_handle
        .state::<KillChannel>()
        .kill_sender
        .lock()
        .await
        .replace(kill_sender);

    tokio::select! {
        exit_status = child.wait() => {
            if let Ok(exit_status) = exit_status {
                let _ = app_handle.emit("exit", exit_status.code());
            }
        }
        _ = kill_receiver => {
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
    x: i32,
    y: i32,
}
impl Default for TrayState {
    fn default() -> Self {
        TrayState {
            width: 0.0,
            tray_closed_height: 0.0,
            tray_open_height: 0.0,
            currently_open: false,
            x: 0,
            y: 0,
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
        let _ = window.set_size(Size::Physical(PhysicalSize {
            width: (guard.width as u32),
            height: (guard.tray_open_height as u32),
        }));
        let _ = window.set_position(PhysicalPosition {
            x: guard.x,
            y: guard.y,
        });
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
        let _ = window.set_size(Size::Physical(PhysicalSize {
            width: (guard.width as u32),
            height: (guard.tray_closed_height as u32),
        }));
        let _ = window.set_position(PhysicalPosition {
            x: guard.x,
            y: guard.y,
        });
        guard.currently_open = false;
    }
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
            trim_path
        ])
        .setup(|app| {
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
    const SCREEN_TO_WIDTH_RATIO: f64 = 0.42;
    const HEIGHT_TO_WIDTH_RATIO: f64 = 0.16;
    const TRAY_TO_BAR_RATIO: f64 = 3.05;
    const Y_OFFSET_RATIO: f64 = 0.05; // 5% of screen height above center

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
        x,
        y,
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
