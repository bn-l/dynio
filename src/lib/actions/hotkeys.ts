
const possibleModifiers = ["Control", "Shift", "Alt", "Meta", "CmdOrCtrl"] as const;

interface HotkeysOptions {
    keys: string[]; 
    handler: (event: KeyboardEvent) => void
    enabledWhenEditing?: boolean;
    enabled?: boolean;
    modifiers?: (typeof possibleModifiers[number])[];
}

export function hotkeys(
    node: HTMLElement, 
    options: HotkeysOptions,
): { destroy: () => void } {

    const { enabledWhenEditing = true, enabled = true, keys, modifiers = [], handler } = options; 

    const handlerWrapper = (event: KeyboardEvent) => {
        if (!enabled) return;

        const targetTagName = (event.target as HTMLElement).tagName;
        const isEditing = targetTagName === "INPUT" || targetTagName === "TEXTAREA" || (targetTagName === "DIV" && (event.target as HTMLElement).isContentEditable);

        if (isEditing && !enabledWhenEditing) return;

        // Check if the event.key is one of the specified keys
        if (!keys.map(key => key.toLowerCase()).includes(event.key.toLowerCase())) return;

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