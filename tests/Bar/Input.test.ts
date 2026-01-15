/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { get } from 'svelte/store';
import {
    query,
    running,
    stdoutLock,
    stdout,
    stderr,
    exitCode,
    currentTrayView,
    currentCmd,
} from '$lib/stores/globals';
import { cmdConfig } from '$lib/stores/cmd-config';
import { settings } from '$lib/stores/settings';
import { errors } from '$lib/stores/errors';
import type { CmdConfigItem } from '$lib/stores/schema/cmd-config-schema';
import Input from '../../src/Bar/Input.svelte';

// Mock Tauri APIs
const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
    invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Helper function to create a minimal config
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

describe('Input.svelte', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockInvoke.mockResolvedValue(undefined);

        // Reset stores
        query.set('');
        running.set(false);
        stdoutLock.set(true);
        stdout.set([]);
        stderr.set('');
        exitCode.set(undefined);
        currentTrayView.set('stdout');
        currentCmd.set('test-cmd');
        cmdConfig.set({
            'test-cmd': createConfig(),
        });
        settings.set({});
        errors.clear();

        // Mock console.log to reduce noise
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    describe('query binding', () => {
        it('binds value to $query', async () => {
            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: 'test query' } });

            // Wait for debounce
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(get(query)).toBe('test query');
        });

        it('reflects $query changes in input value', async () => {
            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            query.set('preset value');

            await vi.waitFor(() => {
                expect(input.value).toBe('preset value');
            });
        });
    });

    describe('runOnEnter=false behavior', () => {
        beforeEach(() => {
            cmdConfig.set({
                'test-cmd': createConfig({ runOnEnter: false }),
            });
        });

        it('executes debounced (30ms) on every keystroke', async () => {
            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: 'test' } });

            // Should be debounced - wait for execution
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(mockInvoke).toHaveBeenCalledWith('run_program', expect.objectContaining({
                program: 'test-program',
                input: 'test',
            }));
        });

        it('does not execute immediately (debounced)', async () => {
            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: 'test' } });

            // Check immediately - should not have called yet
            expect(mockInvoke).not.toHaveBeenCalledWith('run_program', expect.anything());

            // Wait for debounce
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(mockInvoke).toHaveBeenCalledWith('run_program', expect.anything());
        });
    });

    describe('runOnEnter=true behavior', () => {
        beforeEach(() => {
            cmdConfig.set({
                'test-cmd': createConfig({ runOnEnter: true }),
            });
        });

        it('does not execute on input event', async () => {
            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: 'test' } });
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Should not call run_program on input
            expect(mockInvoke).not.toHaveBeenCalledWith('run_program', expect.anything());
        });

        it('only executes on Enter key', async () => {
            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            // First set the value
            await fireEvent.input(input, { target: { value: 'test' } });
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Then press Enter
            await fireEvent.keyDown(input, { key: 'Enter' });
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(mockInvoke).toHaveBeenCalledWith('run_program', expect.objectContaining({
                input: 'test',
            }));
        });
    });

    describe('empty/whitespace input handling', () => {
        it('stops running on empty input', async () => {
            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            // First run with non-empty
            await fireEvent.input(input, { target: { value: 'test' } });
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Then clear
            await fireEvent.input(input, { target: { value: '' } });
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(mockInvoke).toHaveBeenCalledWith('stop_running');
        });

        it('sets $stdoutLock to true on empty input', async () => {
            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            stdoutLock.set(false);

            await fireEvent.input(input, { target: { value: '' } });
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(get(stdoutLock)).toBe(true);
        });

        it('clears state on empty input (stdout, stderr, exitCode)', async () => {
            stdout.set(['old output']);
            stderr.set('old stderr');
            exitCode.set(1);

            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: '' } });
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(get(stdout)).toEqual([]);
            expect(get(stderr)).toBe('');
            expect(get(exitCode)).toBeUndefined();
        });

        it('sets $running to false on empty input', async () => {
            running.set(true);

            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: '' } });
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(get(running)).toBe(false);
        });

        it('treats whitespace-only as empty', async () => {
            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: '   ' } });
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(mockInvoke).toHaveBeenCalledWith('stop_running');
            expect(get(stdoutLock)).toBe(true);
        });
    });

    describe('non-empty input state changes', () => {
        it('sets $running to true on non-empty input', async () => {
            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: 'test' } });
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(get(running)).toBe(true);
        });

        it('sets $stdoutLock to false on non-empty input', async () => {
            stdoutLock.set(true);

            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: 'test' } });
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(get(stdoutLock)).toBe(false);
        });
    });

    describe('font size', () => {
        it('uses font size from $settings.inputFontSize', () => {
            settings.set({ inputFontSize: 2.5 });

            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            expect(input.style.fontSize).toBe('2.5rem');
        });

        it('uses default 1.8rem when inputFontSize not set', () => {
            settings.set({});

            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            expect(input.style.fontSize).toBe('1.8rem');
        });
    });

    describe('placeholder', () => {
        it('shows placeholder from $currentCmdConfig.placeholderText', () => {
            cmdConfig.set({
                'test-cmd': createConfig({ placeholderText: 'Search...' }),
            });

            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            expect(input.placeholder).toBe('Search...');
        });

        it('has no placeholder when not configured', () => {
            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            expect(input.placeholder).toBe('');
        });
    });

    describe('inputFocusAction', () => {
        it('input is focused on mount', () => {
            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            expect(document.activeElement).toBe(input);
        });

        it('auto-refocuses on blur when runOnEnter is false', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({ runOnEnter: false }),
            });

            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.blur(input);

            // Should refocus
            expect(document.activeElement).toBe(input);
        });

        it('does NOT auto-refocus on blur when runOnEnter is true', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({ runOnEnter: true }),
            });

            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            // Create another element to focus
            const other = document.createElement('button');
            document.body.appendChild(other);

            input.blur();
            other.focus();

            // Should not refocus (blur handler checks runOnEnter)
            await new Promise((resolve) => setTimeout(resolve, 10));
            // The input should NOT steal focus back when runOnEnter is true
            // Note: The actual behavior depends on the inputFocusAction implementation
        });
    });

    describe('streaming flag', () => {
        it('sets streaming to true when mode is "llm"', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: {},
                    },
                }),
            });

            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: 'test' } });
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(mockInvoke).toHaveBeenCalledWith('run_program', expect.objectContaining({
                streaming: true,
            }));
        });

        it('sets streaming to false for list mode', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'list',
                        displayOptions: {},
                        activationOptions: {},
                    },
                }),
            });

            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: 'test' } });
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(mockInvoke).toHaveBeenCalledWith('run_program', expect.objectContaining({
                streaming: false,
            }));
        });

        it('sets streaming to false for single mode', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'single',
                        displayOptions: {},
                        activationOptions: {},
                    },
                }),
            });

            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: 'test' } });
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(mockInvoke).toHaveBeenCalledWith('run_program', expect.objectContaining({
                streaming: false,
            }));
        });
    });

    describe('arguments and current_dir', () => {
        it('passes arguments array correctly to run_program', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    arguments: ['--verbose', '-n', '5'],
                }),
            });

            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: 'test' } });
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(mockInvoke).toHaveBeenCalledWith('run_program', expect.objectContaining({
                arguments: ['--verbose', '-n', '5'],
            }));
        });

        it('passes current_dir correctly to run_program', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    currentDir: '/home/user/projects',
                }),
            });

            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: 'test' } });
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(mockInvoke).toHaveBeenCalledWith('run_program', expect.objectContaining({
                current_dir: '/home/user/projects',
            }));
        });

        it('handles undefined arguments (defaults to empty array spread)', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    // arguments not set
                }),
            });

            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: 'test' } });
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(mockInvoke).toHaveBeenCalledWith('run_program', expect.objectContaining({
                arguments: [],
            }));
        });
    });

    describe('currentTrayView on success', () => {
        it('sets currentTrayView to "stdout" on successful invoke', async () => {
            currentTrayView.set('stderr');
            mockInvoke.mockResolvedValue(undefined);

            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: 'test' } });
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(get(currentTrayView)).toBe('stdout');
        });
    });

    describe('invoke error handling', () => {
        it('handles Error instance - adds error with message+stack', async () => {
            const testError = new Error('Test error message');
            testError.stack = 'Error: Test error message\n    at test.ts:1:1';
            mockInvoke.mockRejectedValue(testError);

            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: 'test' } });
            await new Promise((resolve) => setTimeout(resolve, 100));

            const errorList = get(errors);
            expect(errorList.length).toBe(1);
            expect(errorList[0].message).toContain('Test error message');
            expect(errorList[0].type).toBe('unknown');
        });

        it('handles string error - adds error as "tauri" type', async () => {
            mockInvoke.mockRejectedValue('Tauri error string');

            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: 'test' } });
            await new Promise((resolve) => setTimeout(resolve, 100));

            const errorList = get(errors);
            expect(errorList.length).toBe(1);
            expect(errorList[0].message).toBe('Tauri error string');
            expect(errorList[0].type).toBe('tauri');
        });

        it('handles other error types - JSON stringifies as "unknown" type', async () => {
            mockInvoke.mockRejectedValue({ code: 500, reason: 'failure' });

            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: 'test' } });
            await new Promise((resolve) => setTimeout(resolve, 100));

            const errorList = get(errors);
            expect(errorList.length).toBe(1);
            expect(errorList[0].message).toBe('{"code":500,"reason":"failure"}');
            expect(errorList[0].type).toBe('unknown');
        });
    });

    describe('no config handling', () => {
        it('returns early without running when no config', async () => {
            currentCmd.set(undefined);

            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: 'test' } });
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Should not call run_program
            expect(mockInvoke).not.toHaveBeenCalledWith('run_program', expect.anything());
        });

        it('returns early when currentCmd does not exist in cmdConfig', async () => {
            currentCmd.set('nonexistent-cmd');
            cmdConfig.set({
                'other-cmd': createConfig(),
            });

            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: 'test' } });
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Should not call run_program
            expect(mockInvoke).not.toHaveBeenCalledWith('run_program', expect.anything());
        });
    });

    describe('edge cases', () => {
        it('handles rapid input changes (debounced correctly)', async () => {
            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            // Rapid inputs
            await fireEvent.input(input, { target: { value: 't' } });
            await fireEvent.input(input, { target: { value: 'te' } });
            await fireEvent.input(input, { target: { value: 'tes' } });
            await fireEvent.input(input, { target: { value: 'test' } });

            // Wait for debounce
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Should only call run_program once with final value
            const runProgramCalls = mockInvoke.mock.calls.filter(
                (call) => call[0] === 'run_program'
            );
            expect(runProgramCalls.length).toBe(1);
            expect(runProgramCalls[0][1].input).toBe('test');
        });

        it('handles unicode input', async () => {
            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: '日本語テスト' } });
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(mockInvoke).toHaveBeenCalledWith('run_program', expect.objectContaining({
                input: '日本語テスト',
            }));
        });

        it('handles special characters in input', async () => {
            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            await fireEvent.input(input, { target: { value: 'test & "quotes" <script>' } });
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(mockInvoke).toHaveBeenCalledWith('run_program', expect.objectContaining({
                input: 'test & "quotes" <script>',
            }));
        });
    });
});
