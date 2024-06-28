
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
