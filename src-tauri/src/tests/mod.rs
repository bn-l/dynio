use super::*;
use std::io::Cursor;
use std::sync::Arc;
use tokio::io::BufReader;
use tokio::sync::watch;

mod commands;
mod config;
mod ipc;
mod run_program;
mod stop_running;
mod tray_state;
mod window;

#[cfg(target_os = "windows")]
mod windows_platform;
