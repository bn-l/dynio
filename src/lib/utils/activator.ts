
import { writeText } from "@tauri-apps/api/clipboard";
import { open } from "@tauri-apps/api/shell";
import type { ActivationOptions } from "$lib/stores/schema/cmd-config-schema.ts";
import { errors } from "$lib/stores/errors.ts";

const defaultActivationOptions: ActivationOptions = {
    activateAction: "copy",
    extractorRegexBody: undefined,
    extractorFlags: undefined,
    extractorGroup: undefined,
};


export function activate(text: string, options: ActivationOptions = defaultActivationOptions) {

    console.log(`in activation function with: '${text}'`);

    const { activateAction, extractorRegexBody, extractorFlags, extractorGroup } = options;

    function wrapper(text: string) {
        console.log("yoo goo")
        const action = activateAction === "copy" ? writeText : open;

        void action(text).catch(error => {
            const errorMsg = error instanceof Error && "message" in error ? 
                `Error message: ${error.message}` : 
                "Error had no message property";

            errors.addError( `Could not ${activateAction}. Received text: \"${text}\". Check regex settings. ${errorMsg}`,
                "tauri");
        })
    }

    const extractorRegex = extractorRegexBody 
        ? new RegExp(extractorRegexBody, extractorFlags) 
        : undefined;


    if (extractorRegex) {
        const match = text.match(extractorRegex);
        if (match) {
            const extractedText = extractorGroup ? match[extractorGroup] : match[0];
            
            wrapper(extractedText);
        }
    }
    else {
        wrapper(text);
    }

}