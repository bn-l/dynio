
import { writable } from "svelte/store";
import type { Updater, Writable } from "svelte/store";
import yaml from 'yaml';
import type { GeneralSettings } from "$lib/stores/schema/general-settings-schema.ts";
import { merge } from "lodash-es";

// Wraps the update function to persist the store to file. 
//  might break / general be a bad idea.

export const settings = writable<GeneralSettings>({});


