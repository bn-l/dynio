import { z } from "zod";

export default z
  .object({
    darkMode: z
      .enum(["off", "on", "auto"])
      .describe("Theme mode: 'off' for light, 'on' for dark, 'auto' to follow system preference")
      .default("off"),
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
    globalShortcut: z
      .string()
      .describe(
        "Global shortcut to toggle window visibility (e.g., Alt+Space, Option+Space, Cmd+Space). Defaults: Windows=Alt+Space, macOS=Option+Space, Linux=Alt+Space",
      )
      .optional(),
    hideOnLostFocus: z
      .boolean()
      .describe("Whether clicking outside the app will cause it to hide.")
      .default(true),
    runAtStartup: z
      .boolean()
      .describe("Whether to start the app automatically when the user logs in.")
      .default(false),
  })
  .strict();
