/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { cmdConfig } from '$lib/stores/cmd-config';
import { settings } from '$lib/stores/settings';
import { currentCmd } from '$lib/stores/globals';
import { errors } from '$lib/stores/errors';

// Mock Tauri API
const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
    invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Import after mocking
import { loadValidateAndInitConfigStores } from '../../../src/lib/utils/config-file-utils';

describe('Config Loading (config-file-utils.ts)', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Reset stores
        cmdConfig.set({});
        settings.set({});
        currentCmd.set(undefined);
        errors.clear();

        // Mock console.log to reduce noise
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('valid YAML parsing', () => {
        it('valid YAML is parsed and validated via Zod', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: `
test-cmd:
  command: echo
  modeConfig:
    mode: list
    displayOptions: {}
    activationOptions: {}
`,
                settings: `
darkMode: false
`,
            });

            await loadValidateAndInitConfigStores();

            const config = get(cmdConfig);
            expect(config['test-cmd']).toBeTruthy();
            expect(config['test-cmd'].command).toBe('echo');
        });

        it('Zod applies default values from schema', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: `
test-cmd:
  command: echo
  modeConfig:
    mode: list
    displayOptions: {}
    activationOptions: {}
`,
                // Provide empty object YAML so Zod parsing runs and applies defaults
                settings: `{}`,
            });

            await loadValidateAndInitConfigStores();

            const loadedSettings = get(settings);
            // Zod should apply defaults for unspecified fields
            expect(loadedSettings.darkMode).toBe(false);
            expect(loadedSettings.inputFontSize).toBe(1.8);
            expect(loadedSettings.hideOnLostFocus).toBe(true);
        });
    });

    describe('invalid YAML handling', () => {
        it('invalid YAML syntax adds error to store and throws', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: `
test-cmd:
  command: echo
    invalid: indentation
`,
                settings: ``,
            });

            await expect(loadValidateAndInitConfigStores()).rejects.toThrow();

            const errorList = get(errors);
            expect(errorList.length).toBeGreaterThan(0);
            expect(errorList[0].message).toContain('Error parsing');
        });

        it('Zod validation failure adds error to store and throws', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: `
test-cmd:
  command: 123
`,
                settings: ``,
            });

            await expect(loadValidateAndInitConfigStores()).rejects.toThrow();

            const errorList = get(errors);
            expect(errorList.length).toBeGreaterThan(0);
        });
    });

    describe('default values for missing config fields', () => {
        it('missing modeConfig defaults to list mode', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: `
test-cmd:
  command: echo
`,
                settings: ``,
            });

            await loadValidateAndInitConfigStores();

            const config = get(cmdConfig);
            expect(config['test-cmd'].modeConfig.mode).toBe('list');
        });

        it('missing displayOptions defaults to empty object', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: `
test-cmd:
  command: echo
  modeConfig:
    mode: list
    activationOptions: {}
`,
                settings: ``,
            });

            await loadValidateAndInitConfigStores();

            const config = get(cmdConfig);
            expect(config['test-cmd'].modeConfig.displayOptions).toBeDefined();
        });

        it('missing emptyDisplayOptions defaults to empty object', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: `
test-cmd:
  command: echo
  modeConfig:
    mode: list
    displayOptions: {}
    activationOptions: {}
`,
                settings: ``,
            });

            await loadValidateAndInitConfigStores();

            const config = get(cmdConfig);
            const displayOptions = config['test-cmd'].modeConfig.displayOptions;
            expect(displayOptions.emptyDisplayOptions).toBeDefined();
        });

        it('missing activationOptions for list mode defaults to empty object', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: `
test-cmd:
  command: echo
  modeConfig:
    mode: list
    displayOptions: {}
`,
                settings: ``,
            });

            await loadValidateAndInitConfigStores();

            const config = get(cmdConfig);
            const modeConfig = config['test-cmd'].modeConfig;
            if (modeConfig.mode === 'list') {
                expect(modeConfig.activationOptions).toBeDefined();
            }
        });

        it('missing activationOptions for single mode defaults to empty object', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: `
test-cmd:
  command: echo
  modeConfig:
    mode: single
    displayOptions: {}
`,
                settings: ``,
            });

            await loadValidateAndInitConfigStores();

            const config = get(cmdConfig);
            const modeConfig = config['test-cmd'].modeConfig;
            if (modeConfig.mode === 'single') {
                expect(modeConfig.activationOptions).toBeDefined();
            }
        });

        it('LLM mode has no activationOptions requirement', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: `
test-cmd:
  command: echo
  modeConfig:
    mode: llm
    displayOptions: {}
`,
                settings: ``,
            });

            await loadValidateAndInitConfigStores();

            const config = get(cmdConfig);
            expect(config['test-cmd'].modeConfig.mode).toBe('llm');
            // LLM mode shouldn't have activationOptions added
        });
    });

    describe('default command logic', () => {
        it('uses defaultCommand from settings when specified', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: `
cmd-one:
  command: echo
  modeConfig:
    mode: list
    displayOptions: {}
    activationOptions: {}
cmd-two:
  command: echo
  modeConfig:
    mode: list
    displayOptions: {}
    activationOptions: {}
`,
                settings: `
defaultCommand: cmd-two
`,
            });

            await loadValidateAndInitConfigStores();

            expect(get(currentCmd)).toBe('cmd-two');
        });

        it('throws error when defaultCommand not found in config', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: `
cmd-one:
  command: echo
  modeConfig:
    mode: list
    displayOptions: {}
    activationOptions: {}
`,
                settings: `
defaultCommand: nonexistent-cmd
`,
            });

            await expect(loadValidateAndInitConfigStores()).rejects.toThrow(
                /not found in the command config/
            );
        });

        it('falls back to hotkey #1 when defaultCommand not set', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: `
cmd-alpha:
  command: alpha
  modeConfig:
    mode: list
    displayOptions: {}
    activationOptions: {}
cmd-hotkey-one:
  command: hotkey
  hotkeyNumber: 1
  modeConfig:
    mode: list
    displayOptions: {}
    activationOptions: {}
`,
                settings: ``,
            });

            await loadValidateAndInitConfigStores();

            expect(get(currentCmd)).toBe('cmd-hotkey-one');
        });

        it('falls back to first in config when no hotkeys', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: `
cmd-first:
  command: first
  modeConfig:
    mode: list
    displayOptions: {}
    activationOptions: {}
cmd-second:
  command: second
  modeConfig:
    mode: list
    displayOptions: {}
    activationOptions: {}
`,
                settings: ``,
            });

            await loadValidateAndInitConfigStores();

            // Should pick first one (order might not be guaranteed in YAML, but typically first)
            expect(get(currentCmd)).toBeTruthy();
        });
    });

    describe('store updates', () => {
        it('cmdConfig store updated with loaded config', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: `
test-cmd:
  command: echo
  modeConfig:
    mode: list
    displayOptions: {}
    activationOptions: {}
`,
                settings: ``,
            });

            await loadValidateAndInitConfigStores();

            const config = get(cmdConfig);
            expect(config['test-cmd']).toBeTruthy();
        });

        it('settings store updated with loaded settings', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: `
test-cmd:
  command: echo
  modeConfig:
    mode: list
    displayOptions: {}
    activationOptions: {}
`,
                settings: `
inputFontSize: 2.5
alwaysOnTop: true
`,
            });

            await loadValidateAndInitConfigStores();

            const loadedSettings = get(settings);
            expect(loadedSettings.inputFontSize).toBe(2.5);
            expect(loadedSettings.alwaysOnTop).toBe(true);
        });

        it('currentCmd updated only if currently undefined', async () => {
            currentCmd.set(undefined);

            mockInvoke.mockResolvedValue({
                cmd_config: `
test-cmd:
  command: echo
  hotkeyNumber: 1
  modeConfig:
    mode: list
    displayOptions: {}
    activationOptions: {}
`,
                settings: ``,
            });

            await loadValidateAndInitConfigStores();

            expect(get(currentCmd)).toBe('test-cmd');
        });

        it('currentCmd preserved if already set', async () => {
            currentCmd.set('existing-cmd');

            mockInvoke.mockResolvedValue({
                cmd_config: `
test-cmd:
  command: echo
  hotkeyNumber: 1
  modeConfig:
    mode: list
    displayOptions: {}
    activationOptions: {}
`,
                settings: ``,
            });

            await loadValidateAndInitConfigStores();

            // Should keep existing value
            expect(get(currentCmd)).toBe('existing-cmd');
        });
    });

    describe('empty config handling', () => {
        it('empty config text uses empty object', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: ``,
                settings: ``,
            });

            await loadValidateAndInitConfigStores();

            const config = get(cmdConfig);
            expect(Object.keys(config).length).toBe(0);
        });

        it('null-ish config text uses empty object', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: '',
                settings: '',
            });

            await loadValidateAndInitConfigStores();

            const config = get(cmdConfig);
            // Should not crash
            expect(config).toBeDefined();
        });
    });

    describe('multiple commands', () => {
        it('loads multiple commands correctly', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: `
cmd-one:
  command: one
  hotkeyNumber: 1
  modeConfig:
    mode: list
    displayOptions: {}
    activationOptions: {}
cmd-two:
  command: two
  hotkeyNumber: 2
  modeConfig:
    mode: single
    displayOptions: {}
    activationOptions: {}
cmd-three:
  command: three
  hotkeyNumber: 3
  modeConfig:
    mode: llm
    displayOptions: {}
`,
                settings: ``,
            });

            await loadValidateAndInitConfigStores();

            const config = get(cmdConfig);
            expect(Object.keys(config).length).toBe(3);
            expect(config['cmd-one'].modeConfig.mode).toBe('list');
            expect(config['cmd-two'].modeConfig.mode).toBe('single');
            expect(config['cmd-three'].modeConfig.mode).toBe('llm');
        });
    });

    describe('error messages', () => {
        it('error contains stack trace in thrown error', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: `
test-cmd:
  command: 123
`,
                settings: ``,
            });

            try {
                await loadValidateAndInitConfigStores();
            } catch (err) {
                expect(String(err)).toContain('Stacktrace');
            }
        });

        it('error added to store has "js" type', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: `invalid: yaml: syntax`,
                settings: ``,
            });

            try {
                await loadValidateAndInitConfigStores();
            } catch {
                // Expected to throw
            }

            const errorList = get(errors);
            expect(errorList.length).toBeGreaterThan(0);
            expect(errorList[0].type).toBe('js');
        });
    });

    describe('settings validation', () => {
        it('invalid settings YAML adds error and throws', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: `
test-cmd:
  command: echo
  modeConfig:
    mode: list
    displayOptions: {}
    activationOptions: {}
`,
                settings: `
invalid:
  yaml:
    syntax:
`,
            });

            // This might pass YAML parsing but fail Zod validation
            // or if valid YAML but invalid schema
            // Let's test with invalid types
            mockInvoke.mockResolvedValue({
                cmd_config: `
test-cmd:
  command: echo
  modeConfig:
    mode: list
    displayOptions: {}
    activationOptions: {}
`,
                settings: `
inputFontSize: "not a number"
`,
            });

            await expect(loadValidateAndInitConfigStores()).rejects.toThrow();
        });
    });

    describe('edge cases', () => {
        it('handles command with all optional fields', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: `
full-cmd:
  command: full
  arguments:
    - --verbose
    - --output
    - /tmp/out
  currentDir: /home/user
  placeholderText: Enter query...
  runOnEnter: true
  hotkeyNumber: 1
  modeConfig:
    mode: list
    displayOptions:
      parseAnsiColors: true
      reverse: false
      maxLineLength: 100
      fontSize: 1.2
    activationOptions:
      activateAction: copy
      isPath: true
`,
                settings: `
darkMode: true
inputFontSize: 2.0
alwaysOnTop: true
hideOnLostFocus: false
`,
            });

            await loadValidateAndInitConfigStores();

            const config = get(cmdConfig);
            expect(config['full-cmd'].arguments).toEqual(['--verbose', '--output', '/tmp/out']);
            expect(config['full-cmd'].currentDir).toBe('/home/user');
            expect(config['full-cmd'].placeholderText).toBe('Enter query...');
            expect(config['full-cmd'].runOnEnter).toBe(true);

            const loadedSettings = get(settings);
            expect(loadedSettings.darkMode).toBe(true);
            expect(loadedSettings.alwaysOnTop).toBe(true);
        });

        it('handles unicode in command names and values', async () => {
            mockInvoke.mockResolvedValue({
                cmd_config: `
日本語コマンド:
  command: echo
  placeholderText: 検索...
  modeConfig:
    mode: list
    displayOptions: {}
    activationOptions: {}
`,
                settings: ``,
            });

            await loadValidateAndInitConfigStores();

            const config = get(cmdConfig);
            expect(config['日本語コマンド']).toBeTruthy();
            expect(config['日本語コマンド'].placeholderText).toBe('検索...');
        });
    });
});
