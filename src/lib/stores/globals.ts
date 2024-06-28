
import { writable, get } from "svelte/store";
import type { Writable } from "svelte/store";
import { invoke } from "@tauri-apps/api";

export type TrayViewType = "stdout" | "stderr" | "errors" | "info" | "cmdSelector";
export type Focusable = "tile" | "input" | "tray";

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

export const stderr = writable<string[]>([]);


let timeout: number | NodeJS.Timeout = 0;
let emptyStdCounter = 0;

function createStdoutStore() {
    const { subscribe, set: _set } = writable<string[]>([]);

    return {
        subscribe,

        set: (value: string[]) => {

            clearTimeout(timeout);
            // Debounce if it will set stdout to [] to prevent output flashing.
            if(value.length === 0) {
                emptyStdCounter += 1;
                // If 3 empties in a row, clear immediately.
                if(emptyStdCounter > 3) {
                    emptyStdCounter = 0;
                    _set([]);
                    return;
                }
                timeout = setTimeout(() => {
                    _set([]);
                }, 1000);
                return;
            }
            clearTimeout(timeout);
            emptyStdCounter = 0;

            console.log("setting stdout to value")
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
