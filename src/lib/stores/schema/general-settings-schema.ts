
export type GeneralSettings = {
    /**
     * Theme mode: 'off' for light, 'on' for dark, 'auto' to follow system preference.
     * @default "off"
     */
    darkMode?: "off" | "on" | "auto";
    /**
     * Defaults to whichever has hotkey number 1 (or if no hotkeys, the first one it finds)
     */
    defaultCommand?: string;
    firstLaunch?: boolean;
    /**
     * Whether to start hidden or not.
     * @default false
     */
    startMinimised?: boolean;
    /**
     * Size of input font in rem.
     * @default 1.8
     */
    inputFontSize?: number;
    /**
     * Always on top of other windows?
     * @default false
     */
    alwaysOnTop?: boolean;
    /**
     * Global shortcut to toggle window visibility (e.g., Alt+Space, Option+Space, Cmd+Space).
     * Defaults: Windows=Alt+Space, macOS=Option+Space, Linux=Alt+Space
     */
    globalShortcut?: string;
    /**
     * Whether clicking outside the app will cause it to hide.
     * @default true
     */
    hideOnLostFocus?: boolean;
    /**
     * Whether to start the app automatically when the user logs in.
     * @default false
     */
    runAtStartup?: boolean;
}

/**
 * @default false
 */
// autoUpdate?: boolean;

/**
 * Whether to show the welcome info on launch. Explains how to setup the program etc.
 * @default false
 */
// showWelcome?: boolean;


/**
 * Max time a command can take in seconds. By default 300 (= 5 mins).
 * @default 300
 */
// timeoutSecs?: number;


/**
 * Whether clicking outside the command bar will cause it to hide.
 * @default true
 */
// hideOnLostFocus?: boolean;

/**
 * Keep on top of other windows?
 * @default false
 */
// keepOnTop?: boolean;