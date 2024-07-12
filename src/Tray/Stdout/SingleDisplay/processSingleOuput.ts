
import type { OutputOptions } from "$lib/stores/schema/cmd-config-schema.ts";
// import { AnsiUp } from "ansi_up";
import { errors } from "$lib/stores/errors.ts";
import showdown from "showdown";

// const ansi_up = new AnsiUp();
const converter = new showdown.Converter();

export function processSingleOutput(stdout: string[], outputOptions: OutputOptions | undefined) {

    let processed = stdout.join("\n");

    console.log("start of processSingleOutput: ", processed);
    
    if(outputOptions?.display?.type !== "single") {
        return processed;
    }

    // if(outputOptions?.parseAnsiColors) {
    //     processed = ansi_up.ansi_to_html(processed);
    // }

    const { json, jsonPath } = outputOptions?.display.options;

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

    if(outputOptions?.display?.options?.markdown) {
        processed = converter.makeHtml(processed);
    }

    return processed;
}
