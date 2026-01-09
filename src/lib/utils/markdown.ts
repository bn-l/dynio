import DOMPurify from "dompurify";
import { marked } from "marked";

marked.use({ gfm: true, breaks: true });

export function renderMarkdown(text: string): string {
    const sanitizedText = text.replace(/•/g, "");
    const html = marked(sanitizedText, { async: false });
    return DOMPurify.sanitize(html);
}
