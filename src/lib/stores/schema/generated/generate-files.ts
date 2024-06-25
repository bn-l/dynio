/* eslint-disable ts/no-unsafe-argument */

import { quicktype, InputData, jsonInputForTargetLanguage, JSONSchemaInput, FetchingJSONSchemaStore, TargetLanguage } from "quicktype-core";
import fsp from "node:fs/promises";
import tsj, {Config} from "ts-json-schema-generator";
import { jsonSchemaToZod } from "json-schema-to-zod";
import { resolveRefs } from "json-refs"
import { format } from "prettier"

// ---------- CmdConfigConfig JSON Schema From typescript -------------- //

const cmdConfigConfig: Config = {
    path: "./src/schema/cmd-config-schema.ts",
    tsconfig: "./tsconfig.json",
    type: "CmdConfig",
};
const generalSettingsConfig: Config = {
    path: "./src/schema/general-settings-schema.ts",
    tsconfig: "./tsconfig.json",
};
const cmdConfigConfigOutFE = "./src/schema/generated/cmd-config-schema.json";
const generalSettingsOutFE = "./src/schema/generated/general-settings-schema.json";
const cmdConfigConfigOutBE = "./src-tauri/src/data/cmd-config-schema.json";
const generalSettingsOutBE = "./src-tauri/src/data/general-settings-schema.json";

const cmdConfigSchema = tsj.createGenerator(cmdConfigConfig).createSchema(cmdConfigConfig.type);
const generalSettingsSchema = tsj.createGenerator(generalSettingsConfig).createSchema(generalSettingsConfig.type);
const cmdConfigSchemaString = JSON.stringify(cmdConfigSchema, null, 2);
const generalSettingsSchemaString = JSON.stringify(generalSettingsSchema, null, 2);

await fsp.writeFile(cmdConfigConfigOutFE, cmdConfigSchemaString, { encoding: "utf-8" });
await fsp.writeFile(generalSettingsOutFE, generalSettingsSchemaString, { encoding: "utf-8" });
await fsp.writeFile(cmdConfigConfigOutBE, cmdConfigSchemaString, { encoding: "utf-8" });
await fsp.writeFile(generalSettingsOutBE, generalSettingsSchemaString, { encoding: "utf-8" });

// ----------------- Rust types from above JSON schemas  -------------- //

async function quicktypeJSONSchema(
    targetLanguage: TargetLanguage | string | undefined,
    typeName: string, 
    jsonSchemaString: string,
) {
    const schemaInput = new JSONSchemaInput(new FetchingJSONSchemaStore());

    await schemaInput.addSource({ name: typeName, schema: jsonSchemaString });

    const inputData = new InputData();
    inputData.addInput(schemaInput);

    return await quicktype({
        inputData,
        lang: targetLanguage,
        leadingComments: [],
    });
}

const cmdConfigRustTypes = await quicktypeJSONSchema("rust", "CmdConfig", JSON.stringify(cmdConfigSchema));
const generalSettingsRustTypes = await quicktypeJSONSchema("rust", "GeneralSettings", JSON.stringify(generalSettingsSchema));

await fsp.writeFile("./src-tauri/src/types/cmd_config_schema.rs", cmdConfigRustTypes.lines.join("\n"), { encoding: "utf-8" });
await fsp.writeFile("./src-tauri/src/types/general_settings_schema.rs", generalSettingsRustTypes.lines.join("\n"), { encoding: "utf-8" });


// ------------------ ZOD Schema from above JSON schema ------------- //


async function schemaToZodToFile(schema: object, options: string, savePath: string) {
    const { resolved } = await resolveRefs(schema)
    const module = jsonSchemaToZod(resolved, { module: "esm"});
    const formatted = await format(module, { parser: "typescript" })
    await fsp.writeFile(savePath, formatted, { encoding: "utf-8" });
}

await schemaToZodToFile(cmdConfigSchema, "CmdConfig", "./src/schema/generated/cmd-config-schema.zod.ts");
await schemaToZodToFile(generalSettingsSchema, "GeneralSettings", "./src/schema/generated/general-settings-schema.zod.ts");

