import { currentFocus } from "$lib/stores/globals.js";
import type { Focusable } from "$lib/stores/globals.js";
import { get } from "svelte/store";

export function focusSync(node: HTMLElement, focusId: Focusable): { destroy: () => void } {

    // Sync the focus status of this node with store (I.e. when tabbing and this gets 
    //  focus, it will set the store value using the focusId arg supplied).
    const handleFocus = () => {
        currentFocus.set(focusId);
    };

    const handleBlur = (event: FocusEvent) => {
        if (!event.relatedTarget || !(event.relatedTarget as HTMLElement).tabIndex) {
            currentFocus.set(undefined); 
        } 
        // console.log(`${focusId} is blurring`);
    }

    // If the current node is not focussed, and the focusId arg this action was called with
    //  matches the currently focussed in the store, then focus this node.
    const unsubscribe = currentFocus.subscribe(value => { 
        // console.log("in current focus subscribe")
        if (document.activeElement !== node && value === focusId) { 
            node.focus();
        }
    });


    node.addEventListener('focus', handleFocus);
    node.addEventListener('blur', handleBlur);

    return {
        destroy() {
            node.removeEventListener('focus', handleFocus);
            unsubscribe();
        }
    };
}