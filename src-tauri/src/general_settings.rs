
use serde::{Deserialize, Serialize};

/// General settings for the application.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneralSettings {
    /// Whether dark mode is enabled. Defaults to `false`.
    #[serde(default = "default_false")]
    pub dark_mode: bool,
    /// Whether to show the welcome info on launch. Defaults to `false`.
    #[serde(default = "default_false")]
    pub show_welcome: bool,
    /// Max time a command can take in seconds. Defaults to 300 (5 mins).
    #[serde(default = "default_timeout_secs")]
    pub timeout_secs: u32,
    /// Defaults to whichever has hotkey number 1 (or if not hotkeys, the first one it finds).
    pub default_command: Option<String>,
    /// Whether clicking outside the command bar will cause it to hide. Defaults to `true`.
    #[serde(default = "default_true")]
    pub hide_on_lost_focus: bool,
    /// Keep on top of other windows? Defaults to `false`.
    #[serde(default = "default_false")]
    pub keep_on_top: bool,
    /// Indicates if this is the first launch. This field does not have a default and is optional.
    pub first_launch: Option<bool>,
    /// Whether to automatically update. Defaults to `true`.
    #[serde(default = "default_true")]
    pub auto_update: bool,
    /// Whether to start minimised. Defaults to `false`.
    #[serde(default = "default_false")]
    pub start_minimised: bool,
}

fn default_false() -> bool {
    false
}

/// Provides a default value of `true`.
fn default_true() -> bool {
    true
}

/// Provides a default value for `timeout_secs`.
fn default_timeout_secs() -> u32 {
    300
}