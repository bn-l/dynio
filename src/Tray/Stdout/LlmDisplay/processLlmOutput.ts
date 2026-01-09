export interface LlmOut {
    raw: string;
    preThinkOut: string;
    thinkOut: string;
    postThinkOut: string;
    isThinkDone: boolean;
    isThinking: boolean;
    thinkCharCount: number;
}

const DEFAULT_OPEN_PATTERN = "<thinking>|<think>|<\\|thinking\\|>|\\[thinking\\]";
const DEFAULT_CLOSE_PATTERN = "</thinking>|</think>|<\\|/thinking\\|>|\\[/thinking\\]";

export function processLlmOutput(
    stdout: string[],
    openPattern?: string,
    closePattern?: string
): LlmOut {
    const raw = stdout.join("\n");

    const openRegex = new RegExp(openPattern ?? DEFAULT_OPEN_PATTERN);
    const closeRegex = new RegExp(closePattern ?? DEFAULT_CLOSE_PATTERN);

    const openMatch = raw.match(openRegex);

    if (!openMatch) {
        return {
            raw,
            preThinkOut: "",
            thinkOut: "",
            postThinkOut: raw,
            isThinkDone: false,
            isThinking: false,
            thinkCharCount: 0,
        };
    }

    const openIndex = openMatch.index!;
    const openTagLength = openMatch[0].length;
    const preThinkOut = raw.slice(0, openIndex);
    const afterOpenTag = raw.slice(openIndex + openTagLength);

    const closeMatch = afterOpenTag.match(closeRegex);

    if (!closeMatch) {
        // Still inside thinking block
        const thinkOut = afterOpenTag;
        return {
            raw,
            preThinkOut,
            thinkOut,
            postThinkOut: "",
            isThinkDone: false,
            isThinking: true,
            thinkCharCount: thinkOut.length,
        };
    }

    // Thinking is complete
    const closeIndex = closeMatch.index!;
    const closeTagLength = closeMatch[0].length;
    const thinkOut = afterOpenTag.slice(0, closeIndex);
    const postThinkOut = afterOpenTag.slice(closeIndex + closeTagLength);

    return {
        raw,
        preThinkOut,
        thinkOut,
        postThinkOut,
        isThinkDone: true,
        isThinking: false,
        thinkCharCount: thinkOut.length,
    };
}
