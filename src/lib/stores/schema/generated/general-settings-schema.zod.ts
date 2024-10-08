import { z } from "zod";

export default z
  .object({
    darkMode: z.boolean().default(false),
    defaultCommand: z
      .string()
      .describe(
        "Defaults to whichever has hotkey number 1 (or if no hotkeys, the first one it finds)",
      )
      .optional(),
    firstLaunch: z.boolean().optional(),
    startMinimised: z
      .boolean()
      .describe("Whether to start hidden or not.")
      .default(false),
    inputFontSize: z
      .number()
      .describe("Size of input font in rem.")
      .default(1.8),
    alwaysOnTop: z
      .boolean()
      .describe("Always on top of other windows?")
      .default(false),
  })
  .strict();
