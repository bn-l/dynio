
import { AnsiUp } from "ansi_up";

interface ProcessOutputOptions {
    maxLineLength?: number;
    lineSplitter?: string;
    lineSplitterRegex?: string[];
    parseAnsiColors?: boolean;
}

const ansi_up = new AnsiUp();

export function processListOutput(output: string[], options: ProcessOutputOptions) {

    if(!options) return output;
    if(!output || output.length === 0) return [];

    const { maxLineLength, lineSplitter, lineSplitterRegex, parseAnsiColors} = options;

    if(lineSplitterRegex) {
        const regex = new RegExp(lineSplitterRegex[0], lineSplitterRegex[1] ?? "");
        output = output.join("\n").split(regex);
    } 
    else if(lineSplitter) {
        output = output.join("\n").split(lineSplitter);
    }

    if(maxLineLength) {
        output = output.map(line => line.slice(0, maxLineLength));
    }

    if(parseAnsiColors) {
        output = output.map((line: string) => ansi_up.ansi_to_html(line));
    }

    return output;
}
