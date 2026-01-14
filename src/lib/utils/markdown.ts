import DOMPurify from "dompurify";
import { marked } from "marked";

marked.use({ gfm: true, breaks: true });

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
