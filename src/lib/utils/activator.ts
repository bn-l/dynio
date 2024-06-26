
import { writeText } from "@tauri-apps/api/clipboard";
import { open } from "@tauri-apps/api/shell";
import type { ActivationOptions } from "$lib/stores/schema/cmd-config-schema.ts";

const defaultActivationOptions: ActivationOptions = {
    activateAction: "copy",
    extractorRegexBody: undefined,
    extractorFlags: undefined,
    extractorGroup: undefined,
};


export function activate(text: string, options: ActivationOptions = defaultActivationOptions) {

    const { activateAction, extractorRegexBody, extractorFlags, extractorGroup } = options;

    const activateFunction = activateAction === "copy" ? writeText : open;

    const extractorRegex = extractorRegexBody 
        ? new RegExp(extractorRegexBody, extractorFlags) 
        : undefined;

    if (extractorRegex) {
        const match = text.match(extractorRegex);
        if (match) {
            const extractedText = extractorGroup ? match[extractorGroup] : match[0];
            void activateFunction(extractedText);
        }
    }
    else {
        void activateFunction(text);
    }
}