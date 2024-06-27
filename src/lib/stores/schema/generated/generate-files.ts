
import fsp from "node:fs/promises";
import tsj from "ts-json-schema-generator";
import { jsonSchemaToZod } from "json-schema-to-zod";
import { resolveRefs } from "json-refs"
import { format } from "prettier"
import type { Config } from "ts-json-schema-generator";

// ---------- CmdConfigConfig JSON Schema From typescript -------------- //

const cmdConfigConfig: Config = {
    path: "./src/lib/stores/schema/cmd-config-schema.ts",
    tsconfig: "./tsconfig.json",
    type: "CmdConfig",
};
const generalSettingsConfig: Config = {
    path: "./src/lib/stores/schema/general-settings-schema.ts",
    tsconfig: "./tsconfig.json",
};
const cmdConfigConfigOutFE = "./src/lib/stores/schema/generated/cmd-config-schema.json";
const generalSettingsOutFE = "./src/lib/stores/schema/generated/general-settings-schema.json";
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


// ------------------ ZOD Schema from above JSON schema ------------- //


async function schemaToZodToFile(schema: object, options: string, savePath: string) {
    const { resolved } = await resolveRefs(schema)
    const module = jsonSchemaToZod(resolved, { module: "esm"});
    const formatted = await format(module, { parser: "typescript" })
    await fsp.writeFile(savePath, formatted, { encoding: "utf-8" });
}

await schemaToZodToFile(cmdConfigSchema, "CmdConfig", "./src/lib/stores/schema/generated/cmd-config-schema.zod.ts");
await schemaToZodToFile(generalSettingsSchema, "GeneralSettings", "./src/lib/stores/schema/generated/general-settings-schema.zod.ts");

