// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// NB: The macos launcher part is needed for macos but is ignored on windows.
// tauri_plugin_autostart works cross platform.
// use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_single_instance;
use tauri_plugin_fs_watch;
use serde::{Serialize, Deserialize};

// use std::collections::HashMap;
// use std::sync::Arc;
use std::process::Stdio;
use std::sync::Mutex;
use tokio::io::AsyncBufReadExt;
use tokio::time::Duration;
// use std::fs;
// use tauri::{Manager, Window, State, Monitor, Size, PhysicalSize, LogicalSize, PhysicalPosition, LogicalPosition};
use tauri::{Manager, Size, PhysicalSize, PhysicalPosition, Window };
use tauri::GlobalShortcutManager;


// use notify::{Watcher, RecursiveMode};//, RecommendedWatcher };

// mod types { pub mod general_settings_schema; }
// use types::general_settings_schema::GeneralSettings;

// use std::io::BufRead;


#[cfg(target_os = "windows")]
use winapi::um::winbase::CREATE_NO_WINDOW;

use tauri::{CustomMenuItem, SystemTrayMenu, SystemTrayMenuItem, SystemTray};

use std::sync::atomic::{self, AtomicBool};

type VecSender = tokio::sync::watch::Sender<Vec<String>>;

mod general_settings;
use general_settings::GeneralSettings;

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


fn create_collector(app_handle: tauri::AppHandle) -> (VecSender, VecSender) {
    let (stdout_tx, mut stdout_rx) = tokio::sync::watch::channel(Vec::<String>::new());
    let (stderr_tx, mut stderr_rx) = tokio::sync::watch::channel(Vec::<String>::new());

    // If sender is dropped will end these loops.

    let app_handle1 = app_handle.clone();
    tokio::spawn(async move {
        loop {
            let mut update = stdout_rx.borrow_and_update().clone();
            // Absolutely no idea why it comes reversed here (at least from qalc and es does it
            //  also happen with other programs / OSes? "One" (me) asks "oneself" (me also))
            // update.reverse();

            update.dedup();
            app_handle1
                .emit_all("stdout", update)
                .unwrap();
            if stdout_rx.changed().await.is_err() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(16)).await;
        }
    });
 
    let app_handle2 = app_handle.clone();
    tokio::spawn(async move {
        loop {
            let update = stderr_rx.borrow_and_update().clone();
 
            app_handle2
                .emit_all("stderr", update)
                .unwrap();
            if stderr_rx.changed().await.is_err() {
                break;
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(16)).await;
        }
    });

    (stdout_tx, stderr_tx)
}

struct KillChannel {
    kill_sender: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}
impl Default for KillChannel {
    fn default() -> Self {
        KillChannel {
            kill_sender: Mutex::new(None),
        }
    }
}

/// See the example here:  
/// https://docs.rs/tokio/1.38.0/tokio/process/struct.Child.html#method.kill (archived)
/// select! races the two futures and chooses the on that completes first.
///  This allows killing the process without taking up a lock across await
///  (because to kill, need to await) and from different tasks.
///  Starting from the initialisation of the sender and receiver functions:
///    1. The sender is stored in the [`KillChannel`] global state object for another task to use.
///    2. select! is run. It races the two futures, returns when the first completes,
///        and cancels the other branches.
///        If child.wait completes first, great, no one wanted to kill the process.
///        Otherwise if the reciver completes first[^1], then another instance of this
///        function sent () on the stored receiver so we should kill.await.
///    3. (Top of the function) Send () on the saved sender to make sure any processes
///        still running are killed.
///
///   [1]: then receiver itself here has not recv method because the Future trait is
///       implemented on the receiver itself (it can only) receive once because it's a
///       "oneshot" channel).
#[tauri::command]
async fn run_program(
    program: String,
    current_dir: Option<String>,
    arguments: Vec<String>,
    app_handle: tauri::AppHandle,
) -> Result<(), SerError> {

    println!("In run_program");

    if let Some(sender) = app_handle
        .state::<KillChannel>()
        .kill_sender
        .lock()
        .unwrap()
        .take() {
        let _ = sender.send(());
    }

    // Windows commands are run in the default shell (cmd)
    //  and this needs to be told to go into utf8 mode
    //  chcp changes the code page from 437 to utf8
    let mut command = if cfg!(target_os = "windows") {
        let mut temp = tokio::process::Command::new("cmd");
        temp.creation_flags(CREATE_NO_WINDOW);
        let program_quoted = format!(r#""{}""#, program);
        let argstring = format!(r#""chcp 65001 >nul && {} {}""#, program_quoted, arguments.join(" "));
        println!("{argstring}");
        temp.arg("/C");
        temp.raw_arg(&argstring);    
        temp
    } else {
        let mut temp = tokio::process::Command::new(program);
        temp.args(arguments);
        temp
    };

    if let Some(ref dir) = current_dir {
        command.current_dir(std::path::Path::new(dir));
    }


    command.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = command.spawn()?;
    let _ = app_handle.emit_all("started", child.id());
    let stdout_pipe = child.stdout.take().expect("Could not take stdout");
    let stderr_pipe = child.stderr.take().expect("Could not take stderr");

    // Read until LF then check if CR is before it.
    // Append everything up to the CRLF / LF.
    // In the readers do the utf-8 -> utf-16le fallback (if utf-16le fails, ignore line 
    //  and emit error message with line.)

    let mut stdout = tokio::io::BufReader::new(stdout_pipe).lines();
    let mut stderr = tokio::io::BufReader::new(stderr_pipe).lines();

    // Bufreader reads bytes in buf. 

    let (stdout_tx, stderr_tx) = create_collector(app_handle.clone());
    let finish_flag = std::sync::Arc::new(AtomicBool::new(false));

    let finish_flag_clone = finish_flag.clone();
    tokio::spawn(async move {
        while let Some(line) = stdout.next_line().await.expect("Could not get stdout line") {
            if finish_flag_clone.load(atomic::Ordering::Relaxed) { break; }
            stdout_tx.send_modify(|vec| vec.push(line));
        }
    });

    let finish_flag_clone = finish_flag.clone();
    tokio::spawn(async move {
        while let Some(line) = stderr.next_line().await.expect("Could not get stdout line") {
            if finish_flag_clone.load(atomic::Ordering::Relaxed) { break; }
            stderr_tx.send_modify(|vec| vec.push(line));
        }
    });

    let (kill_sender, kill_receiver) = tokio::sync::oneshot::channel::<()>();
    app_handle
        .state::<KillChannel>()
        .kill_sender
        .lock()
        .unwrap()
        .replace(kill_sender);

    tokio::select! {
        exit_status = child.wait() => {
            if let Ok(exit_status) = exit_status {
                let _ = app_handle.emit_all("exit", exit_status.code());
            }
        }
        _ = kill_receiver => { 
            finish_flag.store(true, atomic::Ordering::Relaxed);
            child.kill().await.expect("Couldn't kill process")
        }
    }

    Ok(())
}

// Allows killing without running another command.
#[tauri::command]
fn stop_running(app_handle: tauri::AppHandle) {
    if let Some(sender) = app_handle
        .state::<KillChannel>()
        .kill_sender
        .lock()
        .unwrap()
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
async fn open_tray(app_handle: tauri::AppHandle) {
    let window = app_handle.get_window("main").expect("Could not get main window");
    let state = app_handle.state::<Mutex<TrayState>>();
    let mut guard = state.lock().unwrap();

    if !guard.currently_open {
        let _ = window.set_size(Size::Physical(PhysicalSize {
            width: (guard.width as u32), 
            height: (guard.tray_open_height as u32),
        }));
        guard.currently_open = true;
    }
}

#[tauri::command]
async fn close_tray(app_handle: tauri::AppHandle) {
    let window = app_handle.get_window("main").expect("Could not get main window");
    let state = app_handle.state::<Mutex<TrayState>>();
    let mut guard = state.lock().unwrap();

    if guard.currently_open {
        let _ = window.set_size(Size::Physical(PhysicalSize {
            width: (guard.width as u32), 
            height: (guard.tray_closed_height as u32),
        }));
        guard.currently_open = false;
    }
}

fn toggle_main_window(app_handle: &tauri::AppHandle) {

    println!("toggling main window");

    let tray_item_handle = app_handle.tray_handle().get_item("togglevis");

    if let Some(window) = app_handle.get_window("main") {
        if !window.is_visible().unwrap() {
            let _ = window.show();
            let _ = window.set_focus();
            let _ = app_handle.emit_all("main_hide_unhide", "unhide");
            tray_item_handle.set_title("Hide").expect("Could not set title");
        }
        else {
            let _ = window.hide();
            let _ = app_handle.emit_all("main_hide_unhide", "hide");
            tray_item_handle.set_title("Show").expect("Could not set title");
        }
    }
}

// #[tauri::command]
// async fn show_main(app_handle: tauri::AppHandle) {
//     if let Some(window) = app_handle.get_window("main") {
//         if !window.is_visible().unwrap() {
//             let _ = window.show();
//             let _ = window.set_focus();
//             let _ = app_handle.emit_all("main_hide_unhide", "unhide");
//         }
//     }
// }

#[tauri::command]
async fn hide_main(app_handle: tauri::AppHandle) {
    if let Some(window) = app_handle.get_window("main") {
        let _ = window.hide();
        let _ = app_handle.emit_all("main_hide_unhide", "hide");
    }
}

#[tauri::command]
async fn close_splashscreen(window: Window) { 

    // Close splashscreen
    if let Some(window) = window.get_window("splashscreen") {
        let _ = window.close();
    }

    // Show main window
    if let Some(window) = window.get_window("main") {
        if !window.is_visible().unwrap() {
            let _ = window.show();
            let _ = window.set_focus();
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
    let settings_path = tauri::api::path::home_dir().expect("Could not get home dir.")
        .join(".dynio")
        .join("general-settings.yaml");
    
    let cmdconf_path = tauri::api::path::home_dir().expect("Could not get home dir.")
        .join(".dynio")
        .join("cmd-config.yaml");
    
    let settings_content = std::fs::read_to_string(settings_path)?;
    let cmdconf_content = std::fs::read_to_string(cmdconf_path)?;

    Ok(ConfigFiles {
        settings: settings_content,
        cmd_config: cmdconf_content,
    })
}

#[tauri::command]
async fn get_config_dir() -> Result<String, SerError> {
    let path = tauri::api::path::home_dir().expect("Could not get home dir.").join(".dynio");
    let path_str = path.to_str().expect("Could not convert path to string").to_string();
    Ok(path_str)
}


fn main() {

    let quit = CustomMenuItem::new("quit".to_string(), "Quit");
    let hide = CustomMenuItem::new("togglevis".to_string(), "Hide");
    let tray_menu = SystemTrayMenu::new()
        .add_item(quit)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(hide);
    let system_tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .system_tray(system_tray)
        .manage(KillChannel::default())
        .manage(Mutex::new(TrayState::default()))
        .invoke_handler(tauri::generate_handler![run_program, stop_running, open_tray, close_tray, close_splashscreen, get_config_files, hide_main, get_config_dir, trim_path])
        // .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(Vec::new())))
        .plugin(tauri_plugin_fs_watch::init())
        .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {
        }))
        .on_system_tray_event(system_tray_handler())
        .setup(move |app| {

            // Global shortcuts / "accelerators" setup
            // Alt + Space
            let app_handle_clone = app.app_handle().clone();

            let _ = app.global_shortcut_manager().unregister_all();

            if !app.global_shortcut_manager().is_registered("Alt+Space").expect("Could not get hotkey reg status") {

                let _ = app.global_shortcut_manager().register("Alt+Space", move || {
                    toggle_main_window(&app_handle_clone);
                });
            }

            setup_default_files();

            setup_splash_window(app.app_handle().clone());

            let settings = get_general_settings().expect("Could not get settings");

            println!("{:?}", settings);

            setup_main_window(app.app_handle().clone(), settings.start_minimised);

            Ok(()) 
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


fn system_tray_handler() -> impl Fn(&tauri::AppHandle, tauri::SystemTrayEvent) + 'static {
    move |app, event| {
        match event {
            tauri::SystemTrayEvent::MenuItemClick { id, .. } => {

              match id.as_str() {
                "quit" =>{
                    app.exit(0);
                }
                "togglevis" => {
                    toggle_main_window(&app);
                }
                _ => {}
              }
            }
            _ => {}
        }
    }
}


// Check default files exist (if not create them) then load them
// Set up watcher (debounce by 2 seconds to restart on change)


fn setup_default_files() {

    #[cfg(target_os = "macos")]
    let example_cmdconf = include_str!("./data/example-cmd-config-unix.yaml");
    #[cfg(target_os = "linux")]
    let example_cmdconf = include_str!("./data/example-cmd-config-unix.yaml");
    #[cfg(target_os = "windows")]
    let example_cmdconf = include_str!("./data/example-cmd-config-win.yaml");

    let example_settings = include_str!("./data/default-general-settings.yaml");
    let schema_cmdconf = include_str!("./data/cmd-config-schema.json");
    let schema_settings = include_str!("./data/general-settings-schema.json");
 
    let mut settings_path = tauri::api::path::home_dir().expect("Could not get home dir.");
    settings_path.push(".dynio");
    settings_path.push("general-settings.yaml");

    let mut cmdconf_path = tauri::api::path::home_dir().expect("Could not get home dir.");
    cmdconf_path.push(".dynio");
    cmdconf_path.push("cmd-config.yaml");

    let mut schema_settings_path = tauri::api::path::home_dir().expect("Could not get home dir.");
    schema_settings_path.push(".dynio");
    schema_settings_path.push("cmd-config-schema.json");

    let mut schema_cmdconf_path = tauri::api::path::home_dir().expect("Could not get home dir.");
    schema_cmdconf_path.push(".dynio");
    schema_cmdconf_path.push("general-settings-schema.json");

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

fn get_general_settings() -> Option<GeneralSettings> {
    let mut settings_path = tauri::api::path::home_dir().expect("Could not get home dir.");
    settings_path.push(".dynio");
    settings_path.push("general-settings.yaml");

    let settings_text = if settings_path.exists() {
        Some(std::fs::read_to_string(settings_path).expect("Could not read settings"))
    } else {
        return None;
    };

    let settings = serde_yaml::from_str::<GeneralSettings>(settings_text.as_ref().unwrap()).expect("Could not parse settings");

    Some(settings)
}


fn setup_main_window(app_handle: tauri::AppHandle, hide: bool) {

    const SCREEN_TO_WIDTH_RATIO: f64 = 0.5;
    const HEIGHT_TO_WIDTH_RATIO: f64 = 0.16;
    // const DEFAULT_LOGICAL_WIDTH: f64 = 640.0;
    const TRAY_TO_BAR_RATIO: f64 = 3.05;
    // How far the bar should start from the center. 0 = center.
    const Y_CENTER_OFFSET: i32 = -100;

    let window = app_handle.get_window("main").unwrap();
    let monitor = window.primary_monitor().unwrap_or_else(|_err| {
        window.current_monitor().expect("Couldn't get current monitor")
    }).expect("Couldn't get monitor");

    let phys_width = (monitor.size().width as f64) * SCREEN_TO_WIDTH_RATIO;
    let phys_height = phys_width * HEIGHT_TO_WIDTH_RATIO;
    let phys_tray_height = phys_height * TRAY_TO_BAR_RATIO;

    let guard = app_handle.state::<Mutex<TrayState>>();
    let mut state = guard.lock().unwrap();
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

    let _ = window.set_position(PhysicalPosition {
        x: window.outer_position().expect("couldn't get splash pos").y,
        y: window.outer_position().expect("couldn't get splash pos").y + Y_CENTER_OFFSET,
    });

    if hide {
        println!("hide was true");
        let tray_item_handle = app_handle.tray_handle().get_item("togglevis");
        let _ = window.hide();
        let _ = app_handle.emit_all("main_hide_unhide", "hide");
        tray_item_handle.set_title("Show").expect("Could not set title");
    }
}

fn setup_splash_window(app_handle: tauri::AppHandle) {

    const SCREEN_TO_HEIGHT_RATIO: f64 = 0.6;
    const WIDTH_TO_HEIGHT_RATIO: f64 = 0.7;

    let window = app_handle.get_window("main").unwrap();
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