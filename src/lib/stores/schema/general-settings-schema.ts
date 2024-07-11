
export type GeneralSettings = {
    /**
     * @default false
     */
    darkMode?: boolean;
    /**
     * Whether to show the welcome info on launch. Explains how to setup the program etc.
     * @default false
     */
    showWelcome?: boolean;
    /**
     * Max time a command can take in seconds. By default 300 (= 5 mins).
     * @default 300
     */
    timeoutSecs?: number;
    /**
     * Defaults to whichever has hotkey number 1 (or if not hotkeys, the first one it finds)
     */
    defaultCommand?: string;
    /**
     * Whether clicking outside the command bar will cause it to hide.
     * @default true
     */
    hideOnLostFocus?: boolean;
    /**
     * Keep on top of other windows?
     * @default false
     */
    keepOnTop?: boolean;
    firstLaunch?: boolean;
    /**
     * @default true
     */
    autoUpdate?: boolean;
    /**
     * Whether to start hidden or not.
     * @default false
     */
    startMinimised?: boolean;
}