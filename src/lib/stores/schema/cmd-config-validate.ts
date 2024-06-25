
import type { CmdConfig } from "./cmd-config-schema.js";
import cmdConfigZod from "./generated/cmd-config-schema.zod.js";

// Throw on invalid

export function validateCmdConfig(cmdConfig: CmdConfig) {
    cmdConfigZod.parse(cmdConfig);
}
