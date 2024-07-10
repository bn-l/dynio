
import type { CmdConfig, CmdConfigItem } from "$lib/stores/schema/cmd-config-schema.js";  
import type { Writable } from "svelte/store";
import { writable, derived } from "svelte/store";
import { currentCmd } from "$lib/stores/globals.js";


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
