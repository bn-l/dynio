
import yaml from 'yaml';
import type { CmdConfig } from '$lib/stores/schema/cmd-config-schema.ts';
import type { GeneralSettings } from '$lib/stores/schema/general-settings-schema.ts';
import { invoke } from '@tauri-apps/api';
import { cmdConfig } from "$lib/stores/cmd-config.ts";
import { settings } from "$lib/stores/settings.ts";
import { currentCmd } from "$lib/stores/globals.js";

import cmdConfigZod from "$lib/stores/schema/generated/cmd-config-schema.zod.js";
import generalSettingsZod from "$lib/stores/schema/generated/general-settings-schema.zod.js";


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

    let loadedCmdConfig: CmdConfig = {};
    if (cmdConfigText) {
        try {
            loadedCmdConfig = yaml.parse(cmdConfigText);
            // This applies the defaults in the generated zod files
            loadedCmdConfig = cmdConfigZod.parse(loadedCmdConfig);
        } catch (err) {
            // @ts-expect-error ignore
            const newError = new Error(`Error parsing command config. Message: ${err?.message}. Stacktrace: ${err?.stack}`);
            Object.assign(newError, err);
            throw newError;
        }
    }

    // Setup command general settings 

    let loadedGeneralSettings: GeneralSettings = {};
    if (generalSettingsText) {
        try {
            loadedGeneralSettings = yaml.parse(generalSettingsText);
            // This applies the defaults in the generated zod files
            loadedGeneralSettings = generalSettingsZod.parse(loadedGeneralSettings);
        } catch (err) {
            // @ts-expect-error ignore
            const newError = new Error(`Error parsing general settings. Message: ${err?.message}. Stacktrace: ${err?.stack}`);
            Object.assign(newError, err);
            throw newError;
        }
    }

    // Default command. If not set, find one.

    if (
        loadedGeneralSettings.defaultCommand && 
        !loadedCmdConfig[loadedGeneralSettings.defaultCommand]
    ) {
        throw new Error(`The default command "${loadedGeneralSettings.defaultCommand}" was not found in the command config file. Please check spelling.`);

    } 
    else if (!loadedGeneralSettings.defaultCommand) {
        const hkOne = Object.keys(loadedCmdConfig).find(key => loadedCmdConfig[key].hotkeyNumber === 1);
        loadedGeneralSettings.defaultCommand = hkOne ?? Object.keys(loadedCmdConfig)[0];
    }

    cmdConfig.set(loadedCmdConfig);
    settings.set(loadedGeneralSettings);

    currentCmd.update((current) => {
        if (!current) {
            return loadedGeneralSettings.defaultCommand;
        }
        return current;
    })
 
}