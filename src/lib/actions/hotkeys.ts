interface HotkeysOptions {
    keys: string[]; 
    handler: (event: KeyboardEvent) => void
    enabledWhenEditing?: boolean;
    enabled?: boolean;
    modifiers?: ("Control" | "Shift" | "Alt" | "Meta" | "CtrlOrCmd")[];
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

        // NB: Meta is the Command key on Mac
        const requiredModifiers: { [key: string]: boolean } = {
            "Control": modifiers.includes("Control") || modifiers.includes("CtrlOrCmd"),
            "Shift": modifiers.includes("Shift"),
            "Alt": modifiers.includes("Alt"),
            "Meta": modifiers.includes("Meta") || modifiers.includes("CtrlOrCmd") 
        };

        for (const mod in requiredModifiers) {
            if(modifiers.includes("CtrlOrCmd") && (mod === "Control" || mod === "Meta")) {
                continue;
            } 
            else if (requiredModifiers[mod] && !event.getModifierState(mod)) {
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