import DOMPurify from "dompurify";
import { marked } from "marked";

// A table row's cells: split at pipes not escaped with a backslash, leaving out the outer pipes
function cells(row: string): string[] {
    return row.trim().replace(/^\||(?<!\\)\|$/g, "").split(/(?<!\\)\|/);
}

/**
 * Fixes tables whose separator line (the `|---|---|` under the header) has the wrong number of
 * cells, a common slip in model replies. GFM only treats lines as a table when the separator
 * has one cell per header cell, otherwise marked shows them as plain text. Missing cells are
 * added as `---` and extra ones dropped, keeping any `:` alignment.
 *
 * Only the line after a table's first row is changed, so a body row that happens to be all
 * dashes stays as it is. Fenced code is left alone.
 */
function fixTableSeparators(markdown: string): string {
    const lines = markdown.split("\n");
    let openFence = "";
    return lines.map((line, i) => {
        const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
        if (fence) {
            // Closed by a fence of the same character that's at least as long
            if (!openFence) {
                openFence = fence;
            }
            else if (fence.startsWith(openFence)) {
                openFence = "";
            }
            return line;
        }
        const header = i > 0 ? lines[i - 1] : "";
        const lineAboveHeader = i > 1 ? lines[i - 2] : "";
        if (openFence || !line.includes("|") || !header.includes("|") || lineAboveHeader.includes("|")) {
            return line;
        }
        const separator = cells(line);
        const columns = cells(header).length;
        if (separator.length === columns || !separator.every(cell => /^\s*:?-+:?\s*$/.test(cell))) {
            return line;
        }
        const fixed = Array.from({ length: columns }, (_, n) => n < separator.length ? separator[n].trim() : "---");
        return `| ${fixed.join(" | ")} |`;
    }).join("\n");
}

marked.use({ gfm: true, breaks: true, hooks: { preprocess: fixTableSeparators } });

export function renderMarkdown(text: string): string {
    // // Replace • with * for consistent list handling
    // let processed = text.replace(/•/g, "*");

    // // Ensure blank line before list items that aren't already preceded by one
    // // Matches: non-newline char followed by newline, then list marker (*, -, or 1.)
    // processed = processed.replace(/([^\n])\n([\t ]*[-*] )/g, "$1\n\n$2");
    // processed = processed.replace(/([^\n])\n([\t ]*\d+\. )/g, "$1\n\n$2");

    // // Also handle cases where list starts directly after text with no newline at all
    // // For bullets: any non-whitespace before "* " or "- "
    // processed = processed.replace(/([^\n\s])([-*] )/g, "$1\n\n$2");
    // // For numbered lists: exclude digits before to avoid splitting "1943. " into "1" + "943. "
    // processed = processed.replace(/([^\d\n\s])(\d+\. )/g, "$1\n\n$2");

    const html = marked(text, { async: false });
    return DOMPurify.sanitize(html);
}
