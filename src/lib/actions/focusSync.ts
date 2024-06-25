import { currentFocus } from "$lib/stores/globals.js";
import type { Focusable } from "$lib/stores/globals.js";

export function focusSync(node: HTMLElement, focusable: Focusable): { destroy: () => void } {

    const handleFocus = () => {
        currentFocus.set(focusable);
    };

    node.addEventListener('focus', handleFocus);

    return {
        destroy() {
            node.removeEventListener('focus', handleFocus);
        }
    };
}