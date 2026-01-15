
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openPath } from "@tauri-apps/plugin-opener";
import type { ActivationOptions } from "$lib/stores/schema/cmd-config-schema.ts";
import { errors } from "$lib/stores/errors.ts";
import { invoke } from "@tauri-apps/api/core";

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

    if(openContaining) text = await invoke("trim_path", { path: text });

    try {
        if (activateAction === "command" && "commandPath" in options) {
            const args = [...(options.commandArguments ?? []), text];
            await invoke("spawn_detached", {
                program: options.commandPath,
                arguments: args,
                current_dir: options.commandCurrentDir,
            });
        } else {
            const action = activateAction === "open" ? openPath : writeText;
            await action(text);
        }

        if (options.hideOnActivation ?? true) {
            await invoke("hide_main");
        }
    }
    catch(error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.addError(`Could not perform activateAction '${activateAction}'. Received text: "${text}". ${errorMsg}`,
            "tauri");
    }

}