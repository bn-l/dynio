import type { SingleDisplayOptions, GeneralDisplayOptions } from "$lib/stores/schema/cmd-config-schema.ts";
import { errors } from "$lib/stores/errors.ts";
import { AnsiUp } from "ansi_up";

const ansi_up = new AnsiUp();

export function processSingleOutput(stdout: string[], displayOptions: (SingleDisplayOptions & GeneralDisplayOptions) | undefined) {

    let processed = stdout.join("\n");

    console.log("start of processSingleOutput: ", processed);

    if(!displayOptions) {
        return processed;
    }

    const { json, jsonPath, parseAnsiColors } = displayOptions;

    try {
        if(json && !jsonPath) {
            processed = JSON.stringify(JSON.parse(processed), null, 2);
        }
        else if(json && jsonPath) {
            const jsonParsed = JSON.parse(processed);
            const jsonPathArray = jsonPath.split(".");
            let jsonPathValue = jsonParsed;
            for(const path of jsonPathArray) {
                jsonPathValue = jsonPathValue[path];
            }
            processed = jsonPathValue;
        }
    } catch(e) {
        const errMsg = e instanceof Error && "message" in e ? e.message : "An error occurred while parsing JSON.";
        errors.addError(errMsg, "js");
    }

    if (parseAnsiColors) {
        processed = ansi_up.ansi_to_html(processed);
    }

    return processed;
}
