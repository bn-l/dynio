
import { writable } from "svelte/store";
import type { GeneralSettings } from "$lib/stores/schema/general-settings-schema.ts";

// Wraps the update function to persist the store to file. 
//  might break / general be a bad idea.

export const settings = writable<GeneralSettings>({});


