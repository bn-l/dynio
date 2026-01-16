import { z } from "zod";

export default z.record(
  z
    .object({
      command: z
        .string()
        .describe(
          "Absolute path to cmd or the name of a command that can run in the default shell.",
        ),
      modeConfig: z.union([
        z
          .object({
            mode: z
              .literal("list")
              .describe(
                "Shows item in a list with arrow keys to change selection and enter to activate.",
              ),
            displayOptions: z
              .object({
                parseAnsiColors: z
                  .boolean()
                  .describe(
                    "Whether to parse ansii colors (nb: color might not be accurate)",
                  )
                  .default(true),
                reverse: z
                  .boolean()
                  .describe("Whether to reverse the output")
                  .default(false),
                emptyDisplayOptions: z.record(z.never()).optional(),
                stderrFilterRegex: z
                  .string()
                  .describe(
                    "Regex pattern to filter out matching stderr lines. Lines matching this pattern will be hidden.",
                  )
                  .optional(),
                maxLineLength: z
                  .number()
                  .describe("Displays only this many characters plus per item.")
                  .default(200),
                lineSplitter: z
                  .string()
                  .describe(
                    "Character(s) to split the output into lines.  Defaults to newlines.",
                  )
                  .default("\n"),
                lineSplitterRegex: z
                  .array(z.string())
                  .describe(
                    "Regular expression to split the output into lines as an array where the first item is the regex body and the second is the flags.",
                  )
                  .optional(),
                fontSize: z.number().describe("Value in rem.").optional(),
                hideCount: z
                  .boolean()
                  .describe(
                    "Hides the number of lines received in the top left of the tray / panel under the input box",
                  )
                  .default(false),
              })
              .strict()
              .describe("Display options. Use {} for default options."),
            activationOptions: z
              .union([
                z
                  .object({
                    activateAction: z
                      .literal("copy")
                      .describe("Copy extracted text to clipboard.")
                      .default("copy"),
                    extractorRegexBody: z
                      .string()
                      .describe(
                        "Regex to extract text from each split line for use in the enterAction in this config. Don't pre/post-fix with /.",
                      )
                      .optional(),
                    extractorFlags: z
                      .string()
                      .describe(
                        "Regex flags to extract text from each split line for use in the enterAction in this config. Must have set extractorRegex. Don't pre/post-fix with /.",
                      )
                      .optional(),
                    extractorGroup: z
                      .number()
                      .describe(
                        "Regex group to extract text from each split line for use in the enterAction in this config. Must have set extractorRegex. Don't pre/post-fix with /.",
                      )
                      .optional(),
                    isPath: z
                      .boolean()
                      .describe(
                        "Enables Control or Cmd (on mac) + O to open containing folder. This will get the parent folder of the extracted text or error if the extract text is not a path.",
                      )
                      .default(false),
                    hideOnActivation: z
                      .boolean()
                      .describe(
                        "Hide window after activation (copy, open, command, or reveal).",
                      )
                      .default(true),
                  })
                  .strict(),
                z
                  .object({
                    activateAction: z
                      .literal("open")
                      .describe(
                        "Open extracted text as a path or URL in the default application.",
                      ),
                    extractorRegexBody: z
                      .string()
                      .describe(
                        "Regex to extract text from each split line for use in the enterAction in this config. Don't pre/post-fix with /.",
                      )
                      .optional(),
                    extractorFlags: z
                      .string()
                      .describe(
                        "Regex flags to extract text from each split line for use in the enterAction in this config. Must have set extractorRegex. Don't pre/post-fix with /.",
                      )
                      .optional(),
                    extractorGroup: z
                      .number()
                      .describe(
                        "Regex group to extract text from each split line for use in the enterAction in this config. Must have set extractorRegex. Don't pre/post-fix with /.",
                      )
                      .optional(),
                    isPath: z
                      .boolean()
                      .describe(
                        "Enables Control or Cmd (on mac) + O to open containing folder. This will get the parent folder of the extracted text or error if the extract text is not a path.",
                      )
                      .default(false),
                    hideOnActivation: z
                      .boolean()
                      .describe(
                        "Hide window after activation (copy, open, command, or reveal).",
                      )
                      .default(true),
                  })
                  .strict(),
                z
                  .object({
                    activateAction: z
                      .literal("command")
                      .describe(
                        "Run a command with the extracted text as an argument.",
                      ),
                    commandPath: z
                      .string()
                      .describe("Path to the command executable."),
                    commandArguments: z
                      .array(z.string())
                      .describe(
                        "Arguments for the command. The extracted text is appended as the final argument.",
                      )
                      .optional(),
                    commandCurrentDir: z
                      .string()
                      .describe("Working directory for the command.")
                      .optional(),
                    extractorRegexBody: z
                      .string()
                      .describe(
                        "Regex to extract text from each split line for use in the enterAction in this config. Don't pre/post-fix with /.",
                      )
                      .optional(),
                    extractorFlags: z
                      .string()
                      .describe(
                        "Regex flags to extract text from each split line for use in the enterAction in this config. Must have set extractorRegex. Don't pre/post-fix with /.",
                      )
                      .optional(),
                    extractorGroup: z
                      .number()
                      .describe(
                        "Regex group to extract text from each split line for use in the enterAction in this config. Must have set extractorRegex. Don't pre/post-fix with /.",
                      )
                      .optional(),
                    isPath: z
                      .boolean()
                      .describe(
                        "Enables Control or Cmd (on mac) + O to open containing folder. This will get the parent folder of the extracted text or error if the extract text is not a path.",
                      )
                      .default(false),
                    hideOnActivation: z
                      .boolean()
                      .describe(
                        "Hide window after activation (copy, open, command, or reveal).",
                      )
                      .default(true),
                  })
                  .strict(),
              ])
              .describe(
                "Discriminated union for activation options based on activateAction.",
              ),
          })
          .strict(),
        z
          .object({
            mode: z
              .literal("single")
              .describe("For non-list type output (e.g. JSON responses)."),
            displayOptions: z
              .object({
                parseAnsiColors: z
                  .boolean()
                  .describe(
                    "Whether to parse ansii colors (nb: color might not be accurate)",
                  )
                  .default(true),
                reverse: z
                  .boolean()
                  .describe("Whether to reverse the output")
                  .default(false),
                emptyDisplayOptions: z.record(z.never()).optional(),
                stderrFilterRegex: z
                  .string()
                  .describe(
                    "Regex pattern to filter out matching stderr lines. Lines matching this pattern will be hidden.",
                  )
                  .optional(),
                sizeBreakPoint: z
                  .number()
                  .describe(
                    "Outputs under this size are shown using large size; over using small.",
                  )
                  .default(25),
                largeSize: z
                  .number()
                  .describe(
                    "Font size when output length < sizeBreakPoint. Any valid int or float.",
                  )
                  .default(1.5),
                smallSize: z
                  .number()
                  .describe(
                    "Output string length > sizeBreakPoint. Any valid tailwind font size.",
                  )
                  .default(1.2),
                json: z
                  .boolean()
                  .describe("Whether output is JSON.")
                  .default(true),
                jsonPath: z
                  .string()
                  .describe(
                    "Json path to the data you want in the form: levelOne.levelTwo.levelThree.",
                  )
                  .default("choices.0.message.content"),
              })
              .strict()
              .describe("Display options. Use {} for default options."),
            activationOptions: z
              .union([
                z
                  .object({
                    activateAction: z
                      .literal("copy")
                      .describe("Copy extracted text to clipboard.")
                      .default("copy"),
                    extractorRegexBody: z
                      .string()
                      .describe(
                        "Regex to extract text from each split line for use in the enterAction in this config. Don't pre/post-fix with /.",
                      )
                      .optional(),
                    extractorFlags: z
                      .string()
                      .describe(
                        "Regex flags to extract text from each split line for use in the enterAction in this config. Must have set extractorRegex. Don't pre/post-fix with /.",
                      )
                      .optional(),
                    extractorGroup: z
                      .number()
                      .describe(
                        "Regex group to extract text from each split line for use in the enterAction in this config. Must have set extractorRegex. Don't pre/post-fix with /.",
                      )
                      .optional(),
                    isPath: z
                      .boolean()
                      .describe(
                        "Enables Control or Cmd (on mac) + O to open containing folder. This will get the parent folder of the extracted text or error if the extract text is not a path.",
                      )
                      .default(false),
                    hideOnActivation: z
                      .boolean()
                      .describe(
                        "Hide window after activation (copy, open, command, or reveal).",
                      )
                      .default(true),
                  })
                  .strict(),
                z
                  .object({
                    activateAction: z
                      .literal("open")
                      .describe(
                        "Open extracted text as a path or URL in the default application.",
                      ),
                    extractorRegexBody: z
                      .string()
                      .describe(
                        "Regex to extract text from each split line for use in the enterAction in this config. Don't pre/post-fix with /.",
                      )
                      .optional(),
                    extractorFlags: z
                      .string()
                      .describe(
                        "Regex flags to extract text from each split line for use in the enterAction in this config. Must have set extractorRegex. Don't pre/post-fix with /.",
                      )
                      .optional(),
                    extractorGroup: z
                      .number()
                      .describe(
                        "Regex group to extract text from each split line for use in the enterAction in this config. Must have set extractorRegex. Don't pre/post-fix with /.",
                      )
                      .optional(),
                    isPath: z
                      .boolean()
                      .describe(
                        "Enables Control or Cmd (on mac) + O to open containing folder. This will get the parent folder of the extracted text or error if the extract text is not a path.",
                      )
                      .default(false),
                    hideOnActivation: z
                      .boolean()
                      .describe(
                        "Hide window after activation (copy, open, command, or reveal).",
                      )
                      .default(true),
                  })
                  .strict(),
                z
                  .object({
                    activateAction: z
                      .literal("command")
                      .describe(
                        "Run a command with the extracted text as an argument.",
                      ),
                    commandPath: z
                      .string()
                      .describe("Path to the command executable."),
                    commandArguments: z
                      .array(z.string())
                      .describe(
                        "Arguments for the command. The extracted text is appended as the final argument.",
                      )
                      .optional(),
                    commandCurrentDir: z
                      .string()
                      .describe("Working directory for the command.")
                      .optional(),
                    extractorRegexBody: z
                      .string()
                      .describe(
                        "Regex to extract text from each split line for use in the enterAction in this config. Don't pre/post-fix with /.",
                      )
                      .optional(),
                    extractorFlags: z
                      .string()
                      .describe(
                        "Regex flags to extract text from each split line for use in the enterAction in this config. Must have set extractorRegex. Don't pre/post-fix with /.",
                      )
                      .optional(),
                    extractorGroup: z
                      .number()
                      .describe(
                        "Regex group to extract text from each split line for use in the enterAction in this config. Must have set extractorRegex. Don't pre/post-fix with /.",
                      )
                      .optional(),
                    isPath: z
                      .boolean()
                      .describe(
                        "Enables Control or Cmd (on mac) + O to open containing folder. This will get the parent folder of the extracted text or error if the extract text is not a path.",
                      )
                      .default(false),
                    hideOnActivation: z
                      .boolean()
                      .describe(
                        "Hide window after activation (copy, open, command, or reveal).",
                      )
                      .default(true),
                  })
                  .strict(),
              ])
              .describe(
                "Discriminated union for activation options based on activateAction.",
              ),
          })
          .strict(),
        z
          .object({
            mode: z
              .literal("llm")
              .describe(
                "For LLM output with markdown rendering and thinking block support.",
              ),
            displayOptions: z
              .object({
                parseAnsiColors: z
                  .boolean()
                  .describe(
                    "Whether to parse ansii colors (nb: color might not be accurate)",
                  )
                  .default(true),
                reverse: z
                  .boolean()
                  .describe("Whether to reverse the output")
                  .default(false),
                emptyDisplayOptions: z.record(z.never()).optional(),
                stderrFilterRegex: z
                  .string()
                  .describe(
                    "Regex pattern to filter out matching stderr lines. Lines matching this pattern will be hidden.",
                  )
                  .optional(),
                smallSize: z
                  .number()
                  .describe("Font size for longer outputs (rem).")
                  .default(0.8),
                largeSize: z
                  .number()
                  .describe("Font size for short outputs (rem).")
                  .default(1),
                sizeBreakPoint: z
                  .number()
                  .describe("Output length threshold for font size switching.")
                  .default(100),
                thinkingDisplay: z
                  .enum(["none", "keepHidden", "showWhileThinking", "show"])
                  .describe(
                    'How to handle thinking blocks.\n- "none": Render as-is (no special handling)\n- "keepHidden": Show "🧠 thinking... <count>" while thinking, disappear when normal tokens arrive\n- "showWhileThinking": Show thinking content greyed/italic, disappear when normal tokens arrive\n- "show": Show thinking greyed/italic AND normal tokens',
                  )
                  .default("none"),
                thinkingOpenPattern: z
                  .string()
                  .describe("Regex pattern to match opening thinking tag.")
                  .default(
                    "<thinking>|<think>|<\\|thinking\\|>|\\[thinking\\]",
                  ),
                thinkingClosePattern: z
                  .string()
                  .describe("Regex pattern to match closing thinking tag.")
                  .default(
                    "</thinking>|</think>|<\\|/thinking\\|>|\\[/thinking\\]",
                  ),
              })
              .strict()
              .describe("Display options. Use {} for default options."),
          })
          .strict(),
      ]),
      description: z
        .string()
        .describe("Short description of what the program does")
        .optional(),
      arguments: z
        .array(z.string())
        .describe("Arguments for the cmd")
        .optional(),
      currentDir: z
        .string()
        .describe("Current directory where the command executes")
        .optional(),
      hotkeyNumber: z
        .union([
          z.literal(1),
          z.literal(2),
          z.literal(3),
          z.literal(4),
          z.literal(5),
          z.literal(6),
          z.literal(7),
          z.literal(8),
          z.literal(9),
        ])
        .describe(
          "From 1-9, pressing alt+shift+hotkeyNumber will set the cmd as active.",
        )
        .optional(),
      placeholderText: z
        .string()
        .describe(
          "Input placeholder text. Useful for differentiating between different commands.",
        )
        .default("Input"),
      noOutputTimeoutMs: z
        .number()
        .describe(
          "Milliseconds until the no output message is shown. Helps to prevent display flashing.  May need to be adjusted depending on how fast the command runs.",
        )
        .default(800),
      runOnEnter: z
        .boolean()
        .describe(
          "Whether to run only on enter. If false (the default) the command will be run on every key stroke. **Note!**: To activate a result if runOnEnter is true, press cmd/ctrl + enter  (vs just enter when runOnEnter is false).",
        )
        .default(false),
    })
    .strict(),
);
