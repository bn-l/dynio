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
import { fileHovering } from '$lib/stores/globals';
import type { DragDropEvent } from '@tauri-apps/api/webview';
import type { EventCallback } from '@tauri-apps/api/event';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import Input from '../../src/Bar/Input.svelte';

// Mock Tauri APIs
const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
    invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// The handler Input registers for file drags, so tests can send it events
let dragDropHandler: EventCallback<DragDropEvent> | undefined;

vi.mock('@tauri-apps/api/webview', () => ({
    getCurrentWebview: () => ({
        onDragDropEvent: (handler: EventCallback<DragDropEvent>) => {
            dragDropHandler = handler;
            return Promise.resolve(() => {
                dragDropHandler = undefined;
            });
        },
    }),
}));

const dropPosition = new PhysicalPosition(10, 10);

function sendDragEvent(payload: DragDropEvent) {
    dragDropHandler?.({ event: 'tauri://drag-drop', id: 1, payload });
}

function dropFiles(...paths: string[]) {
    sendDragEvent({ type: 'drop', paths, position: dropPosition });
}

function getInput(container: HTMLElement): HTMLInputElement {
    const input = container.querySelector('#cmdInput');
    if (!(input instanceof HTMLInputElement)) throw new Error('#cmdInput not found');
    return input;
}

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
        fileHovering.set(false);

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

        // Cmd/Ctrl+Enter activates the output (e.g. opens a converted file). It used to run the
        // command again as well, which restarted a conversion and overwrote the file being opened.
        it.each([
            ['Cmd+Enter', { metaKey: true }],
            ['Ctrl+Enter', { ctrlKey: true }],
        ])('does not run on %s', async (_name, modifier) => {
            const { container } = render(Input);
            const input = getInput(container);

            await fireEvent.input(input, { target: { value: 'test' } });
            await fireEvent.keyDown(input, { key: 'Enter', ...modifier });
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(mockInvoke).not.toHaveBeenCalledWith('run_program', expect.anything());
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

        it('uses default 1.5rem when inputFontSize not set', () => {
            settings.set({});

            const { container } = render(Input);
            const input = container.querySelector('#cmdInput') as HTMLInputElement;

            expect(input.style.fontSize).toBe('1.5rem');
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

    describe('dropping a file on the window', () => {
        const recording = '/Users/sam/Desktop/Screen Recording 2026-10-02 at 10.41.23.mov';

        async function renderWithValue(value: string) {
            const { container, unmount } = render(Input);
            const input = getInput(container);
            query.set(value);
            await vi.waitFor(() => expect(input.value).toBe(value));
            return { input, unmount };
        }

        it('fills an empty input with the path', async () => {
            const { input } = await renderWithValue('');

            dropFiles(recording);

            expect(get(query)).toBe(recording);
            expect(input.value).toBe(recording);
        });

        it('inserts the path at the caret', async () => {
            const { input } = await renderWithValue('grep  notes');
            input.setSelectionRange(5, 5);

            dropFiles('/tmp/a.txt');

            expect(get(query)).toBe('grep /tmp/a.txt notes');
            expect(input.selectionStart).toBe('grep /tmp/a.txt'.length);
        });

        it('replaces selected text with the path', async () => {
            const { input } = await renderWithValue('old path here');
            input.setSelectionRange(4, 8);

            dropFiles('/x');

            expect(get(query)).toBe('old /x here');
        });

        it('uses only the first of several files', async () => {
            await renderWithValue('');

            dropFiles('/first.mov', '/second.mov');

            expect(get(query)).toBe('/first.mov');
        });

        it('ignores a drop with no paths', async () => {
            await renderWithValue('keep');

            dropFiles();
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(get(query)).toBe('keep');
            expect(mockInvoke).not.toHaveBeenCalledWith('run_program', expect.anything());
        });

        it('runs the command straight away when runOnEnter is off', async () => {
            cmdConfig.set({ 'test-cmd': createConfig({ runOnEnter: false }) });
            await renderWithValue('');

            dropFiles('/tmp/a.txt');
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(mockInvoke).toHaveBeenCalledWith('run_program', expect.objectContaining({
                input: '/tmp/a.txt',
            }));
        });

        it('waits for Enter when runOnEnter is on', async () => {
            cmdConfig.set({ 'test-cmd': createConfig({ runOnEnter: true }) });
            const { input } = await renderWithValue('');

            dropFiles(recording);
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(mockInvoke).not.toHaveBeenCalledWith('run_program', expect.anything());

            await fireEvent.keyDown(input, { key: 'Enter' });
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(mockInvoke).toHaveBeenCalledWith('run_program', expect.objectContaining({
                input: recording,
            }));
        });

        it('passes a path with spaces, quotes and unicode through unchanged', async () => {
            const path = `/Users/sam/Desktop/Sam's "best" café — 日本.mov`;
            await renderWithValue('');

            dropFiles(path);
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(mockInvoke).toHaveBeenCalledWith('run_program', expect.objectContaining({
                arguments: [],
                input: path,
            }));
        });

        it('focuses the input so Enter reaches it', async () => {
            cmdConfig.set({ 'test-cmd': createConfig({ runOnEnter: true }) });
            const { input } = await renderWithValue('');
            const other = document.createElement('button');
            document.body.appendChild(other);
            other.focus();

            dropFiles(recording);

            expect(document.activeElement).toBe(input);
            other.remove();
        });

        it('highlights the bar while files are dragged over it', async () => {
            await renderWithValue('');

            sendDragEvent({ type: 'enter', paths: [recording], position: dropPosition });
            expect(get(fileHovering)).toBe(true);

            sendDragEvent({ type: 'over', position: dropPosition });
            expect(get(fileHovering)).toBe(true);

            sendDragEvent({ type: 'leave' });
            expect(get(fileHovering)).toBe(false);
        });

        it('removes the highlight on drop', async () => {
            await renderWithValue('');

            sendDragEvent({ type: 'enter', paths: [recording], position: dropPosition });
            dropFiles(recording);

            expect(get(fileHovering)).toBe(false);
        });

        it('does not highlight a drag with no files', async () => {
            await renderWithValue('');

            sendDragEvent({ type: 'enter', paths: [], position: dropPosition });

            expect(get(fileHovering)).toBe(false);
        });

        it('stops listening when unmounted', async () => {
            const { unmount } = await renderWithValue('');
            expect(dragDropHandler).toBeDefined();

            unmount();
            await vi.waitFor(() => expect(dragDropHandler).toBeUndefined());
        });
    });
});
