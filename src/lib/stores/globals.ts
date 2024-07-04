
import { writable, get } from "svelte/store";
import type { Writable } from "svelte/store";
import { invoke } from "@tauri-apps/api";

export type TrayViewType = "stdout" | "stderr" | "errors" | "info" | "cmdSelector";
export type Focusable = "input" | undefined;

export const currentTrayView = writable<TrayViewType>("stdout");
export const currentFocus = writable<Focusable>("input");
export const currentCmd = writable<string | undefined>(undefined);
export const inputLocked = writable(false);
export const viewLocked = writable(false);
export const criticalError = writable("");
export const fileHovering = writable(false);

export const stdoutLock = writable(true);
export const exitCode = writable<number | undefined>(0);
export const running = writable(false);
export const query = writable("");
export const unhiding = writable(true);
export const clickInBounds = writable(false);

export const stderr = writable<string[]>([]);



// let timeout: number | NodeJS.Timeout = 0;
// let emptyStdCounter = 0;

function createStdoutStore() {
    const { subscribe, set: _set } = writable<string[]>([]);

    return {
        subscribe,

        set: (value: string[]) => {
            console.log("in globals, setting stdout")
            _set(value);
        }
    }
}

export const stdout = createStdoutStore();

function createTrayOpenStore() {

    const { subscribe, set: _set } = writable(false);

    return {
        subscribe,
        // First expand window with "open_tray" on backend *then* show tray
        // (do opposite when closing tray)
        set: (value: boolean) => {
            if(value) {
                void invoke("open_tray").then(() => _set(value));
            }
            else {
                _set(value)
                void invoke("close_tray")
            }
        },
    };
}

export const trayOpen = createTrayOpenStore();

export function clearInput() {
    query.set("");
    stdoutLock.set(true);
    exitCode.set(undefined);
    running.set(false);
    stdout.set([]);
    stderr.set([]);
}
