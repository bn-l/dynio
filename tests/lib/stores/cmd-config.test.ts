/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

// Mock Tauri invoke before importing stores
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn().mockResolvedValue(undefined),
}));

// Import stores after mocks
import { cmdConfig, currentCmdConfig } from '../../../src/lib/stores/cmd-config';
import { currentCmd } from '../../../src/lib/stores/globals';
import type { CmdConfig, CmdConfigItem } from '$lib/stores/schema/cmd-config-schema';

// Helper to create a minimal config item
function createConfig(overrides: Partial<CmdConfigItem> = {}): CmdConfigItem {
    return {
        command: 'test-program',
        modeConfig: {
            mode: 'list',
            displayOptions: {},
            activationOptions: {},
        },
        ...overrides,
    };
}

describe('cmd-config.ts stores', () => {
    beforeEach(() => {
        // Reset stores to initial values
        cmdConfig.set({});
        currentCmd.set(undefined);
    });

    describe('cmdConfig store', () => {
        it('is a writable store', () => {
            // Verify we can set and get values
            cmdConfig.set({ 'test-cmd': createConfig() });
            expect(get(cmdConfig)).toHaveProperty('test-cmd');
        });

        it('has default empty object', () => {
            cmdConfig.set({});
            expect(get(cmdConfig)).toEqual({});
        });

        it('can store multiple commands', () => {
            const config: CmdConfig = {
                'cmd1': createConfig({ command: 'program1' }),
                'cmd2': createConfig({ command: 'program2' }),
                'cmd3': createConfig({ command: 'program3' }),
            };

            cmdConfig.set(config);

            const stored = get(cmdConfig);
            expect(Object.keys(stored)).toHaveLength(3);
            expect(stored['cmd1'].command).toBe('program1');
            expect(stored['cmd2'].command).toBe('program2');
            expect(stored['cmd3'].command).toBe('program3');
        });

        it('is subscribable', () => {
            let value: CmdConfig = {};
            const unsubscribe = cmdConfig.subscribe((v) => {
                value = v;
            });

            cmdConfig.set({ 'new-cmd': createConfig() });

            expect(value).toHaveProperty('new-cmd');
            unsubscribe();
        });

        it('supports update method', () => {
            cmdConfig.set({ 'cmd1': createConfig() });

            cmdConfig.update((config) => ({
                ...config,
                'cmd2': createConfig({ command: 'new-program' }),
            }));

            const stored = get(cmdConfig);
            expect(stored).toHaveProperty('cmd1');
            expect(stored).toHaveProperty('cmd2');
        });

        it('stores full config item structure', () => {
            const fullConfig: CmdConfigItem = {
                command: '/usr/bin/fzf',
                modeConfig: {
                    mode: 'list',
                    displayOptions: {
                        maxLineLength: 100,
                        parseAnsiCodes: true,
                    },
                    activationOptions: {
                        activateAction: 'copy',
                        hideOnActivation: true,
                    },
                },
                runOnEnter: true,
                arguments: ['--multi', '--reverse'],
                currentDir: '/home/user',
            };

            cmdConfig.set({ 'fzf': fullConfig });

            const stored = get(cmdConfig);
            expect(stored['fzf']).toEqual(fullConfig);
            expect(stored['fzf'].modeConfig.mode).toBe('list');
            expect(stored['fzf'].arguments).toEqual(['--multi', '--reverse']);
        });
    });

    describe('currentCmdConfig derived store', () => {
        it('derives from currentCmd and cmdConfig', () => {
            // Set up both stores
            currentCmd.set('test-cmd');
            cmdConfig.set({
                'test-cmd': createConfig({ command: 'test-program' }),
            });

            // currentCmdConfig should derive the value
            const result = get(currentCmdConfig);
            expect(result).toBeDefined();
            expect(result?.command).toBe('test-program');
        });

        it('returns undefined when currentCmd is undefined', () => {
            cmdConfig.set({
                'some-cmd': createConfig(),
            });
            currentCmd.set(undefined);

            expect(get(currentCmdConfig)).toBeUndefined();
        });

        it('returns undefined when command not in config', () => {
            currentCmd.set('nonexistent-command');
            cmdConfig.set({
                'other-cmd': createConfig(),
            });

            expect(get(currentCmdConfig)).toBeUndefined();
        });

        it('returns config item when command exists', () => {
            const expectedConfig = createConfig({
                command: 'my-program',
                runOnEnter: true,
            });

            cmdConfig.set({ 'my-cmd': expectedConfig });
            currentCmd.set('my-cmd');

            const result = get(currentCmdConfig);
            expect(result).toEqual(expectedConfig);
        });

        it('updates when currentCmd changes', () => {
            cmdConfig.set({
                'cmd1': createConfig({ command: 'program1' }),
                'cmd2': createConfig({ command: 'program2' }),
            });

            currentCmd.set('cmd1');
            expect(get(currentCmdConfig)?.command).toBe('program1');

            currentCmd.set('cmd2');
            expect(get(currentCmdConfig)?.command).toBe('program2');
        });

        it('updates when cmdConfig changes', () => {
            currentCmd.set('test-cmd');

            cmdConfig.set({
                'test-cmd': createConfig({ command: 'original' }),
            });
            expect(get(currentCmdConfig)?.command).toBe('original');

            cmdConfig.set({
                'test-cmd': createConfig({ command: 'updated' }),
            });
            expect(get(currentCmdConfig)?.command).toBe('updated');
        });

        it('is subscribable', () => {
            let value: CmdConfigItem | undefined = undefined;
            const unsubscribe = currentCmdConfig.subscribe((v) => {
                value = v;
            });

            currentCmd.set('test-cmd');
            cmdConfig.set({
                'test-cmd': createConfig({ command: 'subscribed-program' }),
            });

            expect(value?.command).toBe('subscribed-program');
            unsubscribe();
        });

        it('returns undefined when config removed for current command', () => {
            currentCmd.set('test-cmd');
            cmdConfig.set({
                'test-cmd': createConfig(),
            });

            // Verify it's set
            expect(get(currentCmdConfig)).toBeDefined();

            // Remove the command from config
            cmdConfig.set({});

            // Now should be undefined
            expect(get(currentCmdConfig)).toBeUndefined();
        });
    });

    describe('derived store behavior', () => {
        it('subscription receives initial value', () => {
            currentCmd.set('cmd');
            cmdConfig.set({ 'cmd': createConfig() });

            let receivedValue: CmdConfigItem | undefined;
            const unsubscribe = currentCmdConfig.subscribe((v) => {
                receivedValue = v;
            });

            expect(receivedValue).toBeDefined();
            unsubscribe();
        });

        it('subscription receives updates from both source stores', () => {
            const values: (CmdConfigItem | undefined)[] = [];
            const unsubscribe = currentCmdConfig.subscribe((v) => {
                values.push(v);
            });

            // Initial value
            expect(values[0]).toBeUndefined();

            // Update currentCmd
            currentCmd.set('cmd');
            expect(values[values.length - 1]).toBeUndefined(); // cmd not in config yet

            // Update cmdConfig
            cmdConfig.set({ 'cmd': createConfig() });
            expect(values[values.length - 1]).toBeDefined();

            unsubscribe();
        });

        it('handles rapid updates correctly', () => {
            const configItems = Array.from({ length: 10 }, (_, i) => ({
                [`cmd${i}`]: createConfig({ command: `program${i}` }),
            }));

            // Set all configs
            cmdConfig.set(Object.assign({}, ...configItems));

            // Rapidly change currentCmd
            for (let i = 0; i < 10; i++) {
                currentCmd.set(`cmd${i}`);
                expect(get(currentCmdConfig)?.command).toBe(`program${i}`);
            }
        });
    });

    describe('edge cases', () => {
        it('handles empty string as command key', () => {
            currentCmd.set('');
            cmdConfig.set({
                '': createConfig({ command: 'empty-key-program' }),
            });

            // Empty string is truthy as a key, so this should work
            // But $currentCmd !== undefined check passes for ''
            const result = get(currentCmdConfig);
            expect(result?.command).toBe('empty-key-program');
        });

        it('handles config with null-ish values in optional fields', () => {
            const config: CmdConfigItem = {
                command: 'test',
                modeConfig: {
                    mode: 'list',
                    displayOptions: {},
                    activationOptions: {},
                },
                runOnEnter: undefined,
                arguments: undefined,
                currentDir: undefined,
            };

            currentCmd.set('cmd');
            cmdConfig.set({ 'cmd': config });

            const result = get(currentCmdConfig);
            expect(result).toBeDefined();
            expect(result?.runOnEnter).toBeUndefined();
        });

        it('handles unicode command names', () => {
            currentCmd.set('日本語コマンド');
            cmdConfig.set({
                '日本語コマンド': createConfig({ command: 'unicode-test' }),
            });

            expect(get(currentCmdConfig)?.command).toBe('unicode-test');
        });

        it('handles command names with special characters', () => {
            currentCmd.set('cmd-with.special_chars');
            cmdConfig.set({
                'cmd-with.special_chars': createConfig({ command: 'special-chars' }),
            });

            expect(get(currentCmdConfig)?.command).toBe('special-chars');
        });

        it('handles command names with spaces', () => {
            currentCmd.set('cmd with spaces');
            cmdConfig.set({
                'cmd with spaces': createConfig({ command: 'spaces-in-name' }),
            });

            expect(get(currentCmdConfig)?.command).toBe('spaces-in-name');
        });
    });

    describe('different mode configs', () => {
        it('handles list mode config', () => {
            const listConfig: CmdConfigItem = {
                command: 'fzf',
                modeConfig: {
                    mode: 'list',
                    displayOptions: {
                        parseAnsiCodes: true,
                        maxLineLength: 200,
                    },
                    activationOptions: {
                        activateAction: 'open',
                    },
                },
            };

            currentCmd.set('list-cmd');
            cmdConfig.set({ 'list-cmd': listConfig });

            const result = get(currentCmdConfig);
            expect(result?.modeConfig.mode).toBe('list');
        });

        it('handles single mode config', () => {
            const singleConfig: CmdConfigItem = {
                command: 'jq',
                modeConfig: {
                    mode: 'single',
                    displayOptions: {},
                    activationOptions: {
                        activateAction: 'copy',
                    },
                },
            };

            currentCmd.set('single-cmd');
            cmdConfig.set({ 'single-cmd': singleConfig });

            const result = get(currentCmdConfig);
            expect(result?.modeConfig.mode).toBe('single');
        });

        it('handles llm mode config', () => {
            const llmConfig: CmdConfigItem = {
                command: 'llm-chat',
                modeConfig: {
                    mode: 'llm',
                    displayOptions: {
                        thinkingOpenPattern: '<think>',
                        thinkingClosePattern: '</think>',
                    },
                },
            };

            currentCmd.set('llm-cmd');
            cmdConfig.set({ 'llm-cmd': llmConfig });

            const result = get(currentCmdConfig);
            expect(result?.modeConfig.mode).toBe('llm');
        });
    });
});
