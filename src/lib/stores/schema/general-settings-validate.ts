
import type { GeneralSettings } from "./general-settings-schema.js";
import generalSettingsZod from "./generated/general-settings-schema.zod.js";

// Throw on invalid

export function validateGeneralSettings(generalSettings: GeneralSettings) {
    generalSettingsZod.parse(generalSettings);
}