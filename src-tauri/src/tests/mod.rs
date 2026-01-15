use super::*;
use std::io::Cursor;
use std::sync::Arc;
use tokio::io::BufReader;
use tokio::sync::watch;

mod commands;
mod config;
mod ipc;
mod race_conditions;
mod run_program;
mod stop_running;
mod tray_state;
mod unicode;
mod window;

#[cfg(target_os = "windows")]
mod windows_platform;

#[cfg(target_os = "macos")]
mod macos_platform;
