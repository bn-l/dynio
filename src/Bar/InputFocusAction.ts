// import { clickInBounds } from "$lib/stores/globals.js";
// import { settings } from "$lib/stores/settings.ts";
// import { invoke } from "@tauri-apps/api/tauri";
import { currentCmdConfig } from "$lib/stores/cmd-config.ts";
import { get } from "svelte/store";


export function inputFocusAction(node: HTMLElement): { destroy: () => void } {

    node.focus();

    const handleBlur = (event: FocusEvent) => {
        
        if(event.target) {
            if(!get(currentCmdConfig)?.runOnEnter) {
                (event.target as HTMLElement).focus();
            }
        }
        // if(!get(clickInBounds) && Boolean(get(settings).hideOnLostFocus)) {
        //     console.log("click out of bounds & hideOnLostFocus, invoking toggle_main_window");
        //     void invoke("hide_main");
        // }        
    }

    node.addEventListener('blur', handleBlur);

    return {
        destroy() {
            node.removeEventListener('focus', handleBlur);
        }
    };
}