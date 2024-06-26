
import { writable } from "svelte/store";
import type { Writable } from "svelte/store";

export type TrayViewType = "stdout" | "stderr" | "errors" | "info" | "cmdSelector";
export type Focusable = "tile" | "input" | "tray";

export const currentTrayView = writable<TrayViewType>("stdout");
export const currentFocus = writable<Focusable>("input");
export const currentCmd = writable<string | undefined>(undefined);
export const inputLocked = writable(false);
export const viewLocked = writable(false);
export const criticalError = writable("");
export const fileHovering = writable(false);
export const trayOpen = writable(false);
export const stdout = writable<string[]>([]);
export const stdoutLock = writable(true);
export const exitCode = writable<number | undefined>(0);
export const running = writable(false);
export const query = writable("");
export const unhiding = writable(true);

export const stderr = writable<StderrToCountMap>({});
export type StderrToCountMap = { [err: string]: number };


