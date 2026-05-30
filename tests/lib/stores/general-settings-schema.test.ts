import { describe, expect, it } from 'vitest';
import generalSettingsZod from '../../../src/lib/stores/schema/generated/general-settings-schema.zod';

describe('GeneralSettings schema', () => {
    describe('reshowInCenter', () => {
        it('defaults to false', () => {
            const settings = generalSettingsZod.parse({});

            expect(settings.reshowInCenter).toBe(false);
        });

        it('accepts the camelCase YAML setting name', () => {
            const settings = generalSettingsZod.parse({ reshowInCenter: true });

            expect(settings.reshowInCenter).toBe(true);
        });
    });
});
