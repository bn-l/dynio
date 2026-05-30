use serde::{de, Deserialize, Deserializer, Serialize};
use std::fmt;

/// Theme mode: "off" for light, "on" for dark, "auto" to follow system preference.
#[derive(Debug, Serialize, Default, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DarkMode {
    #[default]
    Off,
    On,
    Auto,
}

impl<'de> Deserialize<'de> for DarkMode {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct DarkModeVisitor;

        impl<'de> de::Visitor<'de> for DarkModeVisitor {
            type Value = DarkMode;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a dark mode value: off, on, auto, true, or false")
            }

            fn visit_bool<E>(self, value: bool) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(if value { DarkMode::On } else { DarkMode::Off })
            }

            fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                match value {
                    "off" | "false" => Ok(DarkMode::Off),
                    "on" | "true" => Ok(DarkMode::On),
                    "auto" => Ok(DarkMode::Auto),
                    other => Err(E::unknown_variant(other, &["off", "on", "auto"])),
                }
            }
        }

        deserializer.deserialize_any(DarkModeVisitor)
    }
}

/// General settings for the application.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneralSettings {
    /// Theme mode. Defaults to `Off` (light).
    #[serde(default)]
    pub dark_mode: DarkMode,

    // ///  Whether to show the welcome info on launch. Defaults to `false`.
    // #[serde(default = "default_false")]
    // pub show_welcome: bool,

    // /// Max time a command can take in seconds. Defaults to 300 (5 mins).
    // #[serde(default = "default_timeout_secs")]
    // pub timeout_secs: u32,
    /// Defaults to whichever has hotkey number 1 (or if not hotkeys, the first one it finds).
    pub default_command: Option<String>,

    // /// Whether clicking outside the command bar will cause it to hide. Defaults to `true`.
    // #[serde(default = "default_true")]
    // pub hide_on_lost_focus: bool,
    /// Indicates if this is the first launch. This field does not have a default and is optional.
    pub first_launch: Option<bool>,

    /// Whether to start minimised. Defaults to `false`.
    #[serde(default = "default_false")]
    pub start_minimised: bool,

    #[serde(default = "default_input_font_size")]
    pub input_font_size: f32,

    /// Keep on top of other windows? Defaults to `false`.
    #[serde(default = "default_false")]
    pub always_on_top: bool,

    /// Global shortcut to toggle window visibility.
    /// Defaults: Windows=Alt+Space, macOS=Option+Space, Linux=Alt+Space
    pub global_shortcut: Option<String>,

    /// Whether to start the app automatically when the user logs in. Defaults to `false`.
    #[serde(default = "default_false")]
    pub run_at_startup: bool,

    /// Max window width in physical pixels. All other dimensions derive from width.
    #[serde(default = "default_max_window_width")]
    pub max_window_width: f64,

    /// Whether the window should ignore saved placement and show in the center.
    #[serde(default = "default_false")]
    pub reshow_in_center: bool,
    // /// Whether to automatically update. Defaults to `true`.
    // #[serde(default = "default_false")]
    // pub auto_update: bool,
}

fn default_false() -> bool {
    false
}

/// Provides a default value of `true`.
// fn default_true() -> bool {
//     true
// }

/// Provides a default value for `timeout_secs`.
// fn default_timeout_secs() -> u32 {
//     300
// }

/// Provides a default value for `timeout_secs`.
fn default_input_font_size() -> f32 {
    1.8
}

fn default_max_window_width() -> f64 {
    1300.0
}
