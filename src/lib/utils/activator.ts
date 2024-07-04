
import { writeText } from "@tauri-apps/api/clipboard";
import { open } from "@tauri-apps/api/shell";
import type { ActivationOptions } from "$lib/stores/schema/cmd-config-schema.ts";
import { errors } from "$lib/stores/errors.ts";
import { invoke } from "@tauri-apps/api/tauri";

const defaultActivationOptions: ActivationOptions = {
    activateAction: "copy",
    extractorRegexBody: undefined,
    extractorFlags: undefined,
    extractorGroup: undefined,
};


export async function activate(
    text: string, 
    options: ActivationOptions = defaultActivationOptions, 
    openContaining: boolean = false
) {

    console.log(`in activation function with: '${text}'`);

    const { activateAction, extractorRegexBody, extractorFlags, extractorGroup } = options;

    if (extractorRegexBody) {
        const extractorRegex = new RegExp(extractorRegexBody, extractorFlags)
        const match = text.match(extractorRegex);

        if (match) {
            const extracted = extractorGroup ? match[extractorGroup] : match[0];
            if(!extracted) {
                errors.addError(`Extractor regex ${extractorRegex} failed to extract any text in ${extracted}`, "js");
            }
            text = extracted;
        }
        else {
            errors.addError(`Regex ${extractorRegex} didn't match anything in ${text}`, "js");
        }
    }

    const action = activateAction === "copy" ? writeText : open;

    if(openContaining) text = await invoke("trim_path", { path: text });

    try {
        await action(text);
    } 
    catch(error) {
        const errorMsg = error instanceof Error && "message" in error ? 
            `Error message: ${error.message}` : 
            "Error had no message property";
        errors.addError( `Could not ${activateAction}. Received text: \"${text}\". Check regex settings. ${errorMsg}`,
            "tauri");
    }

}