// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Serialize, Deserialize};
use std::fs::OpenOptions;
use std::process::Stdio;
use tokio::sync::Mutex;
use tokio::io::AsyncBufReadExt;
use tokio::time::Duration;
use tauri::{Manager, Size, PhysicalSize, PhysicalPosition, WebviewWindow, AppHandle, Emitter};
#[cfg(target_os = "windows")]
use winapi::um::winbase::CREATE_NO_WINDOW;

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};

use std::sync::atomic::{self, AtomicBool};

mod general_settings;
use general_settings::GeneralSettings;

#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

const POLL_DELAY_MS: u64 = 16;
type VecSender = tokio::sync::watch::Sender<Vec<String>>;

fn home_dir() -> std::path::PathBuf {
    dirs::home_dir().expect("Could not get home dir")
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
)
where
    R: tokio::io::AsyncRead + Unpin,
{
    while let Ok(Some(line)) = lines.next_line().await {
        if finish_flag.load(atomic::Ordering::Relaxed) { break; }
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
        .take() {
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
    let window = app_handle.get_webview_window("main").expect("Could not get main window");
    let state = app_handle.state::<Mutex<TrayState>>();
    let mut guard = state.lock().await;

    if !guard.currently_open {
        let _ = window.set_size(Size::Physical(PhysicalSize {
            width: (guard.width as u32),
            height: (guard.tray_open_height as u32),
        }));
        guard.currently_open = true;
    }
}

#[tauri::command]
async fn close_tray(app_handle: AppHandle) {
    let window = app_handle.get_webview_window("main").expect("Could not get main window");
    let state = app_handle.state::<Mutex<TrayState>>();
    let mut guard = state.lock().await;

    if guard.currently_open {
        let _ = window.set_size(Size::Physical(PhysicalSize {
            width: (guard.width as u32),
            height: (guard.tray_closed_height as u32),
        }));
        guard.currently_open = false;
    }
}

fn toggle_main_window(app_handle: &AppHandle) {
    log::debug!("toggling main window");

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
    let parent_path = path.parent().expect("Could not get parent path");
    Ok(parent_path.to_str().expect("Could not convert path to string").to_string())
}

#[derive(Serialize, Deserialize)]
struct ConfigFiles {
    cmd_config: String,
    settings: String,
}

#[tauri::command]
async fn get_config_files() -> Result<ConfigFiles, SerError> {
    let home = home_dir();
    let settings_path = home.join(".dynio").join("general-settings.yaml");
    let cmdconf_path = home.join(".dynio").join("cmd-config.yaml");

    let settings_content = std::fs::read_to_string(settings_path)?;
    let cmdconf_content = std::fs::read_to_string(cmdconf_path)?;

    Ok(ConfigFiles {
        settings: settings_content,
        cmd_config: cmdconf_content,
    })
}

#[tauri::command]
async fn get_config_dir() -> Result<String, SerError> {
    let home = home_dir();
    let path = home.join(".dynio");
    let path_str = path.to_str().expect("Could not convert path to string").to_string();
    Ok(path_str)
}

fn main() {
    let home = home_dir();
    let dynio_dir = home.join(".dynio");
    std::fs::create_dir_all(&dynio_dir).expect("Failed to create .dynio directory");
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

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}))
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
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "quit" => {
                            app.exit(0);
                        }
                        "togglevis" => {
                            toggle_main_window(app);
                        }
                        _ => {}
                    }
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

            // Global shortcut setup (Alt+Space)
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::ShortcutState;

                let app_handle = app.handle().clone();
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |_app, shortcut, event| {
                            if event.state() == ShortcutState::Pressed {
                                let shortcut_str = shortcut.to_string();
                                if shortcut_str.contains("Alt") && shortcut_str.contains("Space") {
                                    toggle_main_window(&app_handle);
                                }
                            }
                        })
                        .build(),
                )?;

                let shortcut: Shortcut = "Alt+Space".parse().expect("Failed to parse shortcut");
                app.global_shortcut().register(shortcut)?;
            }

            setup_default_files();
            setup_splash_window(app.handle().clone());

            let settings = get_general_settings().expect("Could not get settings");
            log::debug!("settings: {:?}", settings);

            setup_main_window(app.handle().clone(), settings.start_minimised, settings.always_on_top);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn setup_default_files() {
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    let example_cmdconf = include_str!("./data/example-cmd-config-unix.yaml");
    #[cfg(target_os = "windows")]
    let example_cmdconf = include_str!("./data/example-cmd-config-win.yaml");

    let example_settings = include_str!("./data/default-general-settings.yaml");
    let schema_cmdconf = include_str!("./data/cmd-config-schema.json");
    let schema_settings = include_str!("./data/general-settings-schema.json");

    let home = home_dir();
    let base_dir = home.join(".dynio");
    let settings_path = home.join(".dynio").join("general-settings.yaml");
    let cmdconf_path = home.join(".dynio").join("cmd-config.yaml");
    let schema_settings_path = home.join(".dynio").join("general-settings-schema.json");
    let schema_cmdconf_path = home.join(".dynio").join("cmd-config-schema.json");

    if !base_dir.exists() {
        std::fs::create_dir(base_dir).expect("Could not create base dir");
    }

    if !settings_path.exists() {
        std::fs::write(settings_path, example_settings).expect("Could not write settings");
    }
    if !cmdconf_path.exists() {
        std::fs::write(cmdconf_path, example_cmdconf).expect("Could not write cmdconf");
    }

    if !schema_settings_path.exists() {
        std::fs::write(schema_settings_path, schema_settings).expect("Could not write schema settings");
    }
    if !schema_cmdconf_path.exists() {
        std::fs::write(schema_cmdconf_path, schema_cmdconf).expect("Could not write schema cmdconf");
    }
}

fn get_general_settings() -> Result<GeneralSettings, Box<dyn std::error::Error>> {
    let home = home_dir();
    let settings_path = home.join(".dynio").join("general-settings.yaml");

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
    const Y_CENTER_OFFSET: i32 = -100;

    let window = app_handle.get_webview_window("main").unwrap();
    let monitor = window.primary_monitor().unwrap_or_else(|_err| {
        window.current_monitor().expect("Couldn't get current monitor")
    }).expect("Couldn't get monitor");

    let phys_width = (monitor.size().width as f64) * SCREEN_TO_WIDTH_RATIO;
    let phys_height = phys_width * HEIGHT_TO_WIDTH_RATIO;
    let phys_tray_height = phys_height * TRAY_TO_BAR_RATIO;

    let guard = app_handle.state::<Mutex<TrayState>>();
    let mut state = tauri::async_runtime::block_on(guard.lock());
    *state = TrayState {
        width: phys_width,
        tray_closed_height: phys_height,
        tray_open_height: phys_tray_height + phys_height,
        currently_open: false,
    };

    let _ = window.set_size(Size::Physical(PhysicalSize {
        width: (phys_width as u32), height: (phys_height as u32),
    }));

    let _ = window.center();

    let pos = window.outer_position().expect("couldn't get splash pos");
    let _ = window.set_position(PhysicalPosition {
        x: pos.x,
        y: pos.y + Y_CENTER_OFFSET,
    });

    if on_top {
        let _ = window.set_always_on_top(on_top);
    }

    if start_hidden {
        log::debug!("start_hidden was true");
        let _ = window.hide();
        let _ = app_handle.emit("main_hide_unhide", "hide");
    }
    else {
        log::debug!("about to set main as focused");
        let _ = window.hide();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn setup_splash_window(app_handle: AppHandle) {
    const SCREEN_TO_HEIGHT_RATIO: f64 = 0.6;
    const WIDTH_TO_HEIGHT_RATIO: f64 = 0.7;

    let window = app_handle.get_webview_window("main").unwrap();
    let monitor = window.primary_monitor().unwrap_or_else(|_err| {
        window.current_monitor().expect("Couldn't get current monitor")
    }).expect("Couldn't get monitor");

    let phys_height = (monitor.size().height as f64) * SCREEN_TO_HEIGHT_RATIO;
    let phys_width = phys_height * WIDTH_TO_HEIGHT_RATIO;

    let _ = window.set_size(Size::Physical(PhysicalSize {
        width: (phys_width as u32), height: (phys_height as u32),
    }));

    let _ = window.center();
    let _ = window.set_focus();
}
