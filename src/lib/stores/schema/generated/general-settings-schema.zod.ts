import { z } from "zod";

export default z
  .object({
    darkMode: z.boolean().default(false),
    showWelcome: z
      .boolean()
      .describe(
        "Whether to show the welcome info on launch. Explains how to setup the program etc.",
      )
      .default(false),
    autoStart: z
      .boolean()
      .describe(
        "Whether to start the app on login automatically. Note: starts hidden.",
      )
      .default(true),
    timeoutSecs: z
      .number()
      .describe(
        "Max time a command can take in seconds. By default 300 (= 5 mins).",
      )
      .default(300),
    defaultCommand: z.string().default("whichever has hotkeyNumber 1"),
    hideOnLostFocus: z
      .boolean()
      .describe(
        "Whether clicking outside the command bar will cause it to hide.",
      )
      .default(true),
    firstLaunch: z.boolean().optional(),
  })
  .strict();
