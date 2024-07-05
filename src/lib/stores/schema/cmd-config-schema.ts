

export interface ListDisplayOptions {
    /**
     * Displays only this many characters plus per item.
     * @default 200
     */
    maxLineLength?: number;
    /**
     * Character(s) to split the output into lines. 
     * Defaults to newlines.
     * @default "\n"
     */
    lineSplitter?: string;
    /**
     * Regular expression to split the output into lines as an array where the first
     * item is the regex body and the second is the flags.
     */
    lineSplitterRegex?: string[];
}

export interface SingleDisplayOptions {
    /**
     * Outputs under this size are shown using large size; over using small.
     * @default 25
     */
    sizeBreakPoint?: number;
    /**
     * Font size when output length < sizeBreakPoint. Any valid int or float.
     * @default 1.5
     */
    largeSize?: number;
    /**
     * Output string length > sizeBreakPoint. Any valid tailwind font size.
     * @default 1.2
     */
    smallSize?: number;
}


export interface EmptyDisplayOptions {
    
}

export type Display =
    { 
        /**
         * Display type
         */
        type: "list"; 
        /**
         * Display options. Use {} for default options.
         * @default {}
         */
        options: ListDisplayOptions 
    } |
    { 
        /**
         * Display type
         */
        type: "single";
        /**
         * Display options. Use {} for default options.
         * @default {}
         */ 
        options: SingleDisplayOptions 
    };


export interface OutputOptions {
    /**
     * Whether to parse ansii colors (nb: color might not be accurate)
     * @default true
     */
    parseAnsiColors?: boolean;
    /**
     * Whether to reverse the output
     * @default false
     */
    reverse?: boolean; 
    /**
     * Display type
     */
    display?: Display;
    emptyDisplayOptions?: EmptyDisplayOptions;
}



export interface ActivationOptions {
    /**
     * Enter / double click action for an output. Useful for opening or copying some text 
     * to the clipboard. By default is undefined and does nothing.
     * If:
     * - no extractor: Will copy / open entire line.
     * - extrator: Will copy / open match.
     * - extractor + extractorGroup: Will copy / open specific match group.
     *
     */
    activateAction?: "copy" | "open";
    /**
     * Regex to extract text from each split line for use in the enterAction in this config.
     * Don't pre/post-fix with /.
     */
    extractorRegexBody?: string;
    /**
     * Regex flags to extract text from each split line for use in the enterAction in this config.
     * Must have set extractorRegex. Don't pre/post-fix with /.
     * @example "gi"
     */
    extractorFlags?: string;
    /**
     * Regex group to extract text from each split line for use in the enterAction in this config.
     * Must have set extractorRegex. Don't pre/post-fix with /.
     */
    extractorGroup?: number;
    /**
     * Enables Control or Cmd (on mac) + O to open containing folder. This will get the parent
     *  folder of the extracted text or error if the extract text is not a path.
     * @default false 
     */
    isPath?: boolean;
}


export type CmdConfigItem = {
    /**
     * Absolute path to cmd or the name of a command that can run in the default shell.
     * @example
     * "C:\\Some Path\\To Some\\program.exe"
     * @example
     * "/somepath/tosome/program"
     */
    command: string;
    /**
     * Short description of what the program does
     */
    description?: string;
    /**
     * Arguments for the cmd
     * @example ["-n", 100]
     */
    arguments?: string[];
    /**
     * Current directory where the command executes
     */
    currentDir?: string;
    outputOptions?: OutputOptions;
    activationOptions?: ActivationOptions;
    /**
     * From 1-9, pressing alt+shift+hotkeyNumber will set the cmd as active.
     */
    hotkeyNumber?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
    /**
     * Input placeholder text. Useful for differentiating between different commands.
     * @default "Input"
     */
    placeholderText?: string;
};

/**
 * @default 
 * Will use the basename of the cmd from the path by default.
 * E.g. For: "C:\\Some Path\\To Some\\program.exe", name will be: "program" 
 */
export type CmdName = string;

export interface CmdConfig {
    [cmdName: CmdName]: CmdConfigItem;
}
