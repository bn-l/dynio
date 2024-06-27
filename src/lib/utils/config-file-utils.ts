
import yaml from 'yaml';
import { validateCmdConfig } from "$lib/stores/schema/cmd-config-validate.ts";
import { validateGeneralSettings } from "$lib/stores/schema/general-settings-validate.ts";
import type { CmdConfig } from '$lib/stores/schema/cmd-config-schema.ts';
import type { GeneralSettings } from '$lib/stores/schema/general-settings-schema.ts';
import { invoke } from '@tauri-apps/api';
import { initializeCmdConfigs } from "$lib/stores/cmd-config.ts";
import { initializeGeneralSettings } from "$lib/stores/settings.ts";
import { currentCmd } from "$lib/stores/globals.js";


// Cannot use join, homeDir from '@tauri-apps/api/path' because it relies on navigator.
//  see:
// https://discord.com/channels/616186924390023171/1133036068543934635/1133036068543934635
// https://discord.com/channels/616186924390023171/1248635971017248912/1248636041657843722
// Sveltekits SSG doesn't have access to navigator (browser only) but these imports need it
// Fix: 
// Get text from backend, remove any writing / updating code in FE.



export async function loadValidateAndInitConfigStores() {

    const { cmd_config: cmdConfigText, settings: generalSettingsText } = await invoke<{
        cmd_config: string,
        settings: string
    }>("get_config_files");

    // Setup command configs

    let cmdConfig: CmdConfig = {};
    if (cmdConfigText) {
        try {
            cmdConfig = yaml.parse(cmdConfigText);
            // This applies the defaults in the generated zod files
            cmdConfig = validateCmdConfig(cmdConfig);
        } catch (err) {
            // @ts-expect-error ignore
            const newError = new Error(`Error parsing command config. Message: ${err?.message}. Stacktrace: ${err?.stack}`);
            Object.assign(newError, err);
            throw newError;
        }
    }

    // Setup command general settings 

    let generalSettings: GeneralSettings = {};
    if (generalSettingsText) {
        try {
            generalSettings = yaml.parse(generalSettingsText);
            // This applies the defaults in the generated zod files
            generalSettings = validateGeneralSettings(generalSettings);
        } catch (err) {
            // @ts-expect-error ignore
            const newError = new Error(`Error parsing general settings. Message: ${err?.message}. Stacktrace: ${err?.stack}`);
            Object.assign(newError, err);
            throw newError;
        }
    }

    // Default command. If not set, find one.

    if (
        generalSettings.defaultCommand && 
        !cmdConfig[generalSettings.defaultCommand]
    ) {
        throw new Error(`The default command "${generalSettings.defaultCommand}" was not found in the command config file. Please check spelling.`);

    } 
    else if (!generalSettings.defaultCommand) {
        const hkOne = Object.keys(cmdConfig).find(key => cmdConfig[key].hotkeyNumber === 1);
        generalSettings.defaultCommand = hkOne ?? Object.keys(cmdConfig)[0];
    }

    initializeCmdConfigs(cmdConfig);
    initializeGeneralSettings(generalSettings);

    currentCmd.update((current) => {
        if (!current) {
            return generalSettings.defaultCommand;
        }
        return current;
    })
 
}