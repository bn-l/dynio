
const possibleModifiers = ["Control", "Shift", "Alt", "Meta", "CmdOrCtrl"] as const;

interface HotkeysOptions {
    keys?: string[];
    /**
     * Physical keys to match by `event.code` (e.g. "KeyJ"). Use these for Ctrl+letter
     * shortcuts, because on macOS Ctrl+letter can give a control character as `event.key`.
     */
    codes?: string[];
    handler: (event: KeyboardEvent) => void
    enabledWhenEditing?: boolean;
    enabled?: boolean;
    modifiers?: (typeof possibleModifiers[number])[];
}

export function hotkeys(
    node: HTMLElement, 
    options: HotkeysOptions,
): { destroy: () => void } {

    const { enabledWhenEditing = true, enabled = true, keys = [], codes = [], modifiers = [], handler } = options;

    const handlerWrapper = (event: KeyboardEvent) => {
        if (!enabled) return;

        const targetTagName = (event.target as HTMLElement).tagName;
        const isEditing = targetTagName === "INPUT" || targetTagName === "TEXTAREA" || (targetTagName === "DIV" && (event.target as HTMLElement).isContentEditable);

        if (isEditing && !enabledWhenEditing) return;

        // Check if the event.key or event.code is one of the specified keys/codes
        const keyMatches = keys.some(key => key.toLowerCase() === event.key.toLowerCase());
        if (!keyMatches && !codes.includes(event.code)) return;

        // Handle CmdOrCtrl specially - requires either Ctrl or Meta
        if (modifiers.includes("CmdOrCtrl")) {
            if (!event.getModifierState("Control") && !event.getModifierState("Meta")) {
                return;
            }
        }

        // Check all standard modifiers (skip CmdOrCtrl since it's handled above)
        for (const mod of possibleModifiers) {
            if (mod === "CmdOrCtrl") continue;
            if (modifiers.includes(mod) && !event.getModifierState(mod)) {
                return;
            }
        }

        handler(event);
    }

    node.addEventListener("keydown", handlerWrapper);

    return {
        destroy() {
            node.removeEventListener("keydown", handlerWrapper);
        }
    };
}