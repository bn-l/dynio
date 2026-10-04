// Streams GPT's answer to the prompt in argv[2] to stdout. It runs on your ChatGPT plan with the
// login the Codex CLI keeps in ~/.codex/auth.json, calling the endpoint Codex calls.
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";

const MODEL = "gpt-6.1-sol";
const EFFORT = "low"; // low (its lowest), medium, high, xhigh or max
// Use the full path if Dynio can't find Codex on its PATH, or finds an older copy first
const CODEX = "codex";
const AUTH_FILE = `${homedir()}/.codex/auth.json`;

const SYSTEM_PROMPT = `You answer questions asked from a quick-launch bar, so your answer is read in a small window.

- Be concise. Start with the direct answer, then add only the detail needed to understand or use it. No preamble, no restating the question, no closing summary or offers of further help.
- Structure the answer logically: put things in the order the reader needs them and group related points. Use short headings, lists or tables only when they make the answer easier to scan.
- Use plain, precise language and Markdown. Put code, commands and file paths in code formatting.
- If the question is ambiguous, answer the most likely reading and say in one line what you assumed.
- If you aren't sure of something, say so instead of guessing.`;

const prompt = process.argv[2];
if (!prompt) {
    console.error("Usage: gpt-ask.mjs <prompt>");
    process.exit(1);
}

// Codex sends its version with every request, and each model needs a minimum version
const codexVersion = execFileSync(CODEX, ["--version"], { encoding: "utf8" }).trim().split(" ")[1];

/**
 * Sends the prompt with the same headers Codex uses. The login is read from auth.json every
 * time, because Codex replaces it when it refreshes.
 */
function ask() {
    const { access_token, account_id } = JSON.parse(readFileSync(AUTH_FILE, "utf8")).tokens;
    return fetch("https://chatgpt.com/backend-api/codex/responses", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${access_token}`,
            "chatgpt-account-id": account_id,
            "OpenAI-Beta": "responses=experimental",
            originator: "codex_cli_rs",
            version: codexVersion,
            "User-Agent": `codex_cli_rs/${codexVersion}`,
            session_id: randomUUID(),
            Accept: "text/event-stream",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: MODEL,
            instructions: SYSTEM_PROMPT,
            input: [{ type: "message", role: "user", content: [{ type: "input_text", text: prompt }] }],
            reasoning: { effort: EFFORT },
            // Codex's "Fast": 2x speed, uses more of the plan's allowance
            service_tier: "priority",
            store: false,
            stream: true,
        }),
    });
}

/**
 * Has Codex refresh its login, which it saves to auth.json. This script never refreshes it
 * itself: every refresh replaces the refresh token, so if two programs did it, one would be left
 * holding a dead one and Codex could be logged out.
 *
 * Codex's app server talks JSON-RPC, one message per line: introduce ourselves (initialize),
 * then ask for the account with a refresh (account/read), and stop when that's answered.
 */
async function refreshLogin() {
    const codex = spawn(CODEX, ["app-server"], { stdio: ["pipe", "pipe", "ignore"] });
    const send = (message) => codex.stdin.write(`${JSON.stringify(message)}\n`);
    send({ id: 1, method: "initialize", params: { clientInfo: { name: "dynio_gpt_ask", version: "1.0.0" } } });
    for await (const line of createInterface({ input: codex.stdout })) {
        const { id, method } = JSON.parse(line);
        // Notifications and requests from Codex have a method; answers to ours don't
        if (method) continue;
        if (id === 1) {
            send({ method: "initialized" });
            send({ id: 2, method: "account/read", params: { refreshToken: true } });
        }
        else if (id === 2) break;
    }
    codex.kill();
}

// The login lasts about 10 days and Codex refreshes it whenever it runs, so it only runs out
// here if Codex hasn't been used for a while
let response = await ask();
if (response.status === 401) {
    await response.body?.cancel();
    await refreshLogin();
    response = await ask();
}

if (!response.ok) {
    console.error(`ChatGPT returned ${response.status}: ${await response.text()}`);
    if (response.status === 401) console.error("Codex couldn't refresh its login. Sign in again with `codex login`.");
    process.exit(1);
}

// The stream is server-sent events: an "event: <type>" line, then a "data: {json}" line
for await (const line of createInterface({ input: Readable.fromWeb(response.body), crlfDelay: Infinity })) {
    if (!line.startsWith("data: ")) continue;
    const event = JSON.parse(line.slice(6));
    if (event.type === "response.output_text.delta") process.stdout.write(event.delta);
    if (event.type === "error" || event.type === "response.failed") {
        console.error(`ChatGPT failed: ${JSON.stringify(event.error ?? event.response?.error ?? event)}`);
        process.exit(1);
    }
}
process.stdout.write("\n");
