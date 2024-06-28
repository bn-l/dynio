import { currentFocus } from "$lib/stores/globals.js";
import type { Focusable } from "$lib/stores/globals.js";


export function focusSync(node: HTMLElement, focusId: Focusable): { destroy: () => void } {

    // Sync the focus status of this node with store (I.e. when tabbing and this gets 
    //  focus, it will set the store value using the focusId arg supplied).
    const handleFocus = () => {
        currentFocus.set(focusId);
    };

    // If the current node is not focussed, and the focusId arg this action was called with
    //  matches the currently focussed in the store, then focus this node.
    const unsubscribe = currentFocus.subscribe(value => { 
        if (document.activeElement !== node && value === focusId) { 
            node.focus();
        }
    });


    node.addEventListener('focus', handleFocus);

    return {
        destroy() {
            node.removeEventListener('focus', handleFocus);
            unsubscribe();
        }
    };
}