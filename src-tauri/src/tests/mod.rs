use super::*;
use std::io::Cursor;
use std::sync::Arc;
use tokio::io::BufReader;
use tokio::sync::watch;

mod commands;
mod config;
mod events;
mod general_settings_features;
mod ipc;
mod race_conditions;
mod run_program;
mod settings;
mod shortcuts;
mod stop_running;
mod tray_menu;
mod tray_state;
mod unicode;
mod window;

#[cfg(target_os = "windows")]
mod windows_platform;

#[cfg(target_os = "macos")]
mod macos_platform;

#[cfg(target_os = "linux")]
mod linux_platform;
