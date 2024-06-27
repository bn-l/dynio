
import type { CmdConfig, CmdConfigItem } from "$lib/stores/schema/cmd-config-schema.js";  
import type { Writable, Readable } from "svelte/store";
import { writable, derived , get } from "svelte/store";
import { currentCmd } from "$lib/stores/globals.js";
import { merge } from "lodash-es";


export const cmdConfig: Writable<CmdConfig> = writable({});

export const currentCmdConfig = derived<[typeof currentCmd, typeof cmdConfig], CmdConfigItem | undefined>(
    [currentCmd, cmdConfig],
    ([$currentCmd, $cmdConfig]) => {

        // console.log("currentCmdConfig in store", get(cmdConfig));
 
        return $currentCmd !== undefined && $cmdConfig[$currentCmd] ?
            $cmdConfig[$currentCmd] :
            undefined;
    }
);

const defaultListCmdConfigItem: Partial<CmdConfigItem> = {
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

const defaultSingleCmdConfigItem: Partial<CmdConfigItem> = {
    outputOptions: {
        display: {
            type: "single",
            options: {
                sizeBreakPoint: 25,
                largeSize: "text-4xl",
                smallSize: "text-xl",
            }
        },
        parseAnsiColors: true,
    },
    mode: "runOnKeystroke",
    activationOptions: {
        activateAction: "copy",
    },
    runOnBlank: false,
}

export function initializeCmdConfigs(incoming: CmdConfig) {

    const withDefaults: CmdConfig = Object.fromEntries(
        Object.entries(incoming).map(([cmdName, cmdConfigItem]) => {

            if (cmdConfigItem?.outputOptions?.display?.type === "list") {
                return [cmdName, merge({}, defaultListCmdConfigItem, cmdConfigItem)];
            }
            else {
                return [cmdName, merge({}, defaultSingleCmdConfigItem, cmdConfigItem)];
            }
        })
    );

    cmdConfig.set(withDefaults);

}

