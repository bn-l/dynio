import { z } from "zod";

export default z.record(
  z
    .object({
      command: z
        .string()
        .describe(
          "Absolute path to cmd or the name of a command that can run in the default shell.",
        ),
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
      outputOptions: z
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
          display: z
            .union([
              z
                .object({
                  type: z
                    .literal("list")
                    .describe(
                      "Shows item in a list with arrow keys to change selection and enter to activate.",
                    ),
                  options: z
                    .object({
                      maxLineLength: z
                        .number()
                        .describe(
                          "Displays only this many characters plus per item.",
                        )
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
                    .strict(),
                })
                .strict(),
              z
                .object({
                  type: z
                    .literal("single")
                    .describe(
                      "WARNING: Experimental. For non-list type output.",
                    ),
                  options: z
                    .object({
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
                    })
                    .strict(),
                })
                .strict(),
            ])
            .optional(),
          emptyDisplayOptions: z.record(z.never()).optional(),
        })
        .strict()
        .optional(),
      activationOptions: z
        .object({
          activateAction: z
            .enum(["copy", "open"])
            .describe(
              "Enter / double click action for an output. Useful for opening or copying some text  to the clipboard. By default is undefined and does nothing. If:\n- no extractor: Will copy / open entire line.\n- extrator: Will copy / open match.\n- extractor + extractorGroup: Will copy / open specific match group.",
            )
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
              "Enables Control or Cmd (on mac) + O to open containing folder. This will get the parent  folder of the extracted text or error if the extract text is not a path.",
            )
            .default(false),
        })
        .strict()
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
    })
    .strict(),
);
