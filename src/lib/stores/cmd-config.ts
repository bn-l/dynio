
import type { CmdConfig, CmdConfigItem } from "$lib/stores/schema/cmd-config-schema.js";  
import type { Writable, Readable } from "svelte/store";
import { writable, derived } from "svelte/store";
import { currentCmd } from "$lib/stores/globals.js";
import { merge } from "lodash-es";
import { get } from "svelte/store";

export const cmdConfig: Writable<CmdConfig> = writable({});

export const currentCmdConfig = derived<[typeof currentCmd, typeof cmdConfig], CmdConfigItem | undefined>(
    [currentCmd, cmdConfig],
    ([$currentCmd, $cmdConfig]) => {

        // console.log("currentCmdConfig in store", get(cmdConfig));
 
        // eslint-disable-next-line ts/strict-boolean-expressions
        return $currentCmd !== undefined && $cmdConfig[$currentCmd] ?
            $cmdConfig[$currentCmd] :
            undefined;
    }
);

export function initializeCmdConfigs(incoming: CmdConfig) {

    const defaultCmdConfigItem: Partial<CmdConfigItem> = {
        outputOptions: {
            display: {
                type: "list",
                options: {
                    lineSplitter: "\n",
                    maxLineLength: 160,
                    // maxItems: 1000,
                }
            },
            parseAnsiiColors: true,
        },
        mode: "runOnKeystroke",
        activationOptions: {
            activateAction: "copy",
        },
        runOnBlank: false,
    }


    const withDefaults: CmdConfig = Object.fromEntries(
        Object.entries(incoming).map(([cmdName, cmdConfigItem]) => {
            return [cmdName, merge({}, defaultCmdConfigItem, cmdConfigItem)];
        })
    );

    cmdConfig.set(withDefaults);

}

