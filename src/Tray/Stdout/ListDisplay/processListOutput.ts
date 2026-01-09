import { AnsiUp } from "ansi_up";
import stripAnsi from "strip-ansi";

interface ProcessOutputOptions {
    maxLineLength?: number;
    lineSplitter?: string;
    lineSplitterRegex?: string[];
    parseAnsiColors?: boolean;
}

export interface ProcessedItem {
    display: string;  // HTML (if parseAnsiColors) or plain text for rendering
    raw: string;      // Clean text for activation (copy/open)
}

const ansi_up = new AnsiUp();

export function processListOutput(output: string[], options: ProcessOutputOptions): ProcessedItem[] {

    if(!options) return output.map(line => ({ display: line, raw: line }));
    if(!output || output.length === 0) return [];

    const { maxLineLength, lineSplitter, lineSplitterRegex, parseAnsiColors } = options;

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

    return output.map(line => ({
        display: parseAnsiColors ? ansi_up.ansi_to_html(line) : line,
        raw: stripAnsi(line),
    }));
}
