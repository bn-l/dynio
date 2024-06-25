
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
     * Whether to start the app on login automatically. Note: starts hidden.
     * @default true
     */
    autoStart?: boolean;
    /**
     * Max time a command can take in seconds. By default 300 (= 5 mins).
     * @default 300
     */
    timeoutSecs?: number;
    /**
     * @default whichever has hotkeyNumber 1
     */
    defaultCommand?: string;
    /**
     * Whether clicking outside the command bar will cause it to hide.
     * @default true
     */
    hideOnLostFocus?: boolean;
    firstLaunch?: boolean;
}