import { z } from "zod";

export default z
  .object({
    darkMode: z
      .enum(["off", "on", "auto"])
      .describe(
        "Theme mode: 'off' for light, 'on' for dark, 'auto' to follow system preference.",
      )
      .default("off"),
    lightTheme: z
      .enum(["dusty-peach", "dusty-peach-inverted"])
      .describe(
        'Colour theme in light mode. "dusty-peach": a light peach tray with a deeper input. "dusty-peach-inverted": a deeper peach tray with a lighter input.',
      )
      .default("dusty-peach"),
    darkTheme: z
      .literal("dark-peach")
      .describe(
        'Colour theme in dark mode. "dark-peach": charcoal greys with peach highlights.',
      )
      .default("dark-peach"),
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
      .default(1.5),
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
    maxWindowWidth: z
      .number()
      .describe(
        "Max window width in physical pixels. All other dimensions derive from width.",
      )
      .default(1300),
    reshowInCenter: z
      .boolean()
      .describe(
        "Whether to ignore saved window placement and show in the center.",
      )
      .default(false),
  })
  .strict();
