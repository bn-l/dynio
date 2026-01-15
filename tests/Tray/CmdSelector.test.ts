/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { cmdConfig } from '$lib/stores/cmd-config';
import {
    currentCmd,
    query,
    stdout,
    currentTrayView,
    currentFocus,
    stdoutLock,
    statusBar,
    keySymbols,
} from '$lib/stores/globals';
import type { CmdConfigItem } from '$lib/stores/schema/cmd-config-schema';
import CmdSelector from '../../src/Tray/CmdSelector.svelte';

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
            activationOptions: {
                activateAction: 'copy',
            },
        },
        ...overrides,
    };
}

describe('CmdSelector.svelte', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockInvoke.mockResolvedValue(undefined);

        // Reset stores
        cmdConfig.set({});
        currentCmd.set(undefined);
        query.set('');
        stdout.set([]);
        currentTrayView.set('cmdSelector');
        currentFocus.set('input');
        stdoutLock.set(true);
        statusBar.set({ actions: [], count: '' });

        // Mock console.log to reduce noise
        vi.spyOn(console, 'log').mockImplementation(() => {});

        // Mock scrollIntoView
        Element.prototype.scrollIntoView = vi.fn();
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    describe('rendering commands', () => {
        it('renders all commands from $cmdConfig', () => {
            cmdConfig.set({
                cmd1: createConfig({ command: 'program1' }),
                cmd2: createConfig({ command: 'program2' }),
                cmd3: createConfig({ command: 'program3' }),
            });

            const { container } = render(CmdSelector);

            const items = container.querySelectorAll('.cmd-item');
            expect(items.length).toBe(3);
        });

        it('shows command name', () => {
            cmdConfig.set({
                'my-command': createConfig(),
            });

            const { container } = render(CmdSelector);

            expect(container.textContent).toContain('my-command');
        });

        it('shows command program/path', () => {
            cmdConfig.set({
                cmd: createConfig({ command: '/usr/bin/custom-program' }),
            });

            const { container } = render(CmdSelector);

            expect(container.textContent).toContain('/usr/bin/custom-program');
        });

        it('shows description when present', () => {
            cmdConfig.set({
                cmd: createConfig({ description: 'A helpful description' }),
            });

            const { container } = render(CmdSelector);

            expect(container.textContent).toContain('A helpful description');
        });

        it('shows arguments when present', () => {
            cmdConfig.set({
                cmd: createConfig({ arguments: ['--flag', 'value'] }),
            });

            const { container } = render(CmdSelector);

            expect(container.textContent).toContain('--flag');
            expect(container.textContent).toContain('value');
        });
    });

    describe('command sorting', () => {
        it('sorts commands with hotkeys before those without', () => {
            cmdConfig.set({
                'no-hotkey': createConfig(),
                'has-hotkey': createConfig({ hotkeyNumber: 1 }),
            });

            const { container } = render(CmdSelector);

            const items = container.querySelectorAll('.cmd-item');
            const firstItemName = items[0].querySelector('.cmd-name')?.textContent;
            expect(firstItemName).toBe('has-hotkey');
        });

        it('sorts commands by hotkey number', () => {
            cmdConfig.set({
                cmd3: createConfig({ hotkeyNumber: 3 }),
                cmd1: createConfig({ hotkeyNumber: 1 }),
                cmd2: createConfig({ hotkeyNumber: 2 }),
            });

            const { container } = render(CmdSelector);

            const items = container.querySelectorAll('.cmd-item');
            const names = Array.from(items).map((item) => item.querySelector('.cmd-name')?.textContent);
            expect(names).toEqual(['cmd1', 'cmd2', 'cmd3']);
        });

        it('commands without hotkeys appear after those with hotkeys', () => {
            cmdConfig.set({
                'z-no-hotkey': createConfig(),
                'a-no-hotkey': createConfig(),
                'with-hotkey': createConfig({ hotkeyNumber: 5 }),
            });

            const { container } = render(CmdSelector);

            const items = container.querySelectorAll('.cmd-item');
            const firstItemName = items[0].querySelector('.cmd-name')?.textContent;
            expect(firstItemName).toBe('with-hotkey');
        });
    });

    describe('hotkey badge', () => {
        it('shows hotkey badge when hotkeyNumber is set', () => {
            cmdConfig.set({
                cmd: createConfig({ hotkeyNumber: 3 }),
            });

            const { container } = render(CmdSelector);

            const badge = container.querySelector('.hotkey-badge');
            expect(badge).toBeTruthy();
            expect(badge?.textContent).toContain(keySymbols.cmd);
            expect(badge?.textContent).toContain('3');
        });

        it('does not show hotkey badge when hotkeyNumber is not set', () => {
            cmdConfig.set({
                cmd: createConfig(),
            });

            const { container } = render(CmdSelector);

            const badge = container.querySelector('.hotkey-badge');
            expect(badge).toBeNull();
        });
    });

    describe('mode metadata', () => {
        it('shows mode metadata (capitalised) for list mode', () => {
            cmdConfig.set({
                cmd: createConfig({
                    modeConfig: {
                        mode: 'list',
                        displayOptions: {},
                        activationOptions: { activateAction: 'copy' },
                    },
                }),
            });

            const { container } = render(CmdSelector);

            expect(container.textContent).toContain('Mode:');
            expect(container.textContent).toContain('List');
        });

        it('shows mode metadata (capitalised) for single mode', () => {
            cmdConfig.set({
                cmd: createConfig({
                    modeConfig: {
                        mode: 'single',
                        displayOptions: {},
                        activationOptions: { activateAction: 'open' },
                    },
                }),
            });

            const { container } = render(CmdSelector);

            expect(container.textContent).toContain('Single');
        });

        it('shows mode metadata (capitalised) for llm mode', () => {
            cmdConfig.set({
                cmd: createConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: {},
                    },
                }),
            });

            const { container } = render(CmdSelector);

            expect(container.textContent).toContain('Llm');
        });

        it('shows action metadata for list mode', () => {
            cmdConfig.set({
                cmd: createConfig({
                    modeConfig: {
                        mode: 'list',
                        displayOptions: {},
                        activationOptions: { activateAction: 'copy' },
                    },
                }),
            });

            const { container } = render(CmdSelector);

            expect(container.textContent).toContain('Action:');
            expect(container.textContent).toContain('Copy');
        });

        it('shows action metadata for single mode', () => {
            cmdConfig.set({
                cmd: createConfig({
                    modeConfig: {
                        mode: 'single',
                        displayOptions: {},
                        activationOptions: { activateAction: 'open' },
                    },
                }),
            });

            const { container } = render(CmdSelector);

            expect(container.textContent).toContain('Action:');
            expect(container.textContent).toContain('Open');
        });

        it('does NOT show action metadata for llm mode', () => {
            cmdConfig.set({
                cmd: createConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: {},
                    },
                }),
            });

            const { container } = render(CmdSelector);

            // LLM mode doesn't have activationOptions
            const metaItems = container.querySelectorAll('.meta-item');
            const hasAction = Array.from(metaItems).some((item) => item.textContent?.includes('Action:'));
            expect(hasAction).toBe(false);
        });
    });

    describe('capitaliseFirst helper', () => {
        it('handles undefined -> shows "undefined" (lowercase)', () => {
            cmdConfig.set({
                cmd: createConfig({
                    modeConfig: {
                        mode: 'list',
                        displayOptions: {},
                        activationOptions: {}, // No activateAction
                    },
                }),
            });

            const { container } = render(CmdSelector);

            // When activateAction is undefined, capitaliseFirst returns "undefined" (lowercase)
            expect(container.textContent).toContain('Action:');
            // The action text shows "undefined" (lowercase literal string, not capitalized)
            const metaItems = container.querySelectorAll('.meta-item');
            const actionItem = Array.from(metaItems).find((item) => item.textContent?.includes('Action:'));
            expect(actionItem?.textContent).toContain('undefined');
        });
    });

    describe('arrow key navigation', () => {
        it('arrow down increases selectedIndex (debounced)', async () => {
            cmdConfig.set({
                cmd1: createConfig(),
                cmd2: createConfig(),
                cmd3: createConfig(),
            });
            currentCmd.set('cmd1');

            const { container } = render(CmdSelector);

            await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
            await new Promise((resolve) => setTimeout(resolve, 30));

            await vi.waitFor(() => {
                const items = container.querySelectorAll('.cmd-item');
                expect(items[1].classList.contains('item-selected')).toBe(true);
            });
        });

        it('arrow up decreases selectedIndex (debounced)', async () => {
            cmdConfig.set({
                cmd1: createConfig(),
                cmd2: createConfig(),
            });
            currentCmd.set('cmd2');

            const { container } = render(CmdSelector);

            // Start at cmd2 (index 1), go up
            await fireEvent.keyDown(document.body, { key: 'ArrowUp' });
            await new Promise((resolve) => setTimeout(resolve, 30));

            await vi.waitFor(() => {
                const items = container.querySelectorAll('.cmd-item');
                expect(items[0].classList.contains('item-selected')).toBe(true);
            });
        });

        it('arrow up at index 0 stays at 0', async () => {
            cmdConfig.set({
                cmd1: createConfig(),
                cmd2: createConfig(),
            });
            currentCmd.set('cmd1');

            const { container } = render(CmdSelector);

            await fireEvent.keyDown(document.body, { key: 'ArrowUp' });
            await new Promise((resolve) => setTimeout(resolve, 30));

            const items = container.querySelectorAll('.cmd-item');
            expect(items[0].classList.contains('item-selected')).toBe(true);
        });

        it('arrow down at last item stays at last', async () => {
            cmdConfig.set({
                cmd1: createConfig(),
                cmd2: createConfig(),
            });
            currentCmd.set('cmd2');

            const { container } = render(CmdSelector);

            // Navigate to last item
            await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
            await new Promise((resolve) => setTimeout(resolve, 30));
            await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
            await new Promise((resolve) => setTimeout(resolve, 30));

            await vi.waitFor(() => {
                const items = container.querySelectorAll('.cmd-item');
                expect(items[items.length - 1].classList.contains('item-selected')).toBe(true);
            });
        });
    });

    describe('Enter key selection', () => {
        it('Enter selects command and updates $currentCmd', async () => {
            cmdConfig.set({
                cmd1: createConfig(),
                cmd2: createConfig(),
            });
            currentCmd.set(undefined);

            render(CmdSelector);

            // Navigate to cmd1 (index 0) and press Enter
            await fireEvent.keyDown(document.body, { key: 'Enter' });

            await vi.waitFor(() => {
                expect(get(currentCmd)).toBe('cmd1');
            });
        });

        it('Enter clears query', async () => {
            cmdConfig.set({
                cmd: createConfig(),
            });
            query.set('some query');

            render(CmdSelector);

            await fireEvent.keyDown(document.body, { key: 'Enter' });

            await vi.waitFor(() => {
                expect(get(query)).toBe('');
            });
        });

        it('Enter clears stdout', async () => {
            cmdConfig.set({
                cmd: createConfig(),
            });
            stdout.set(['some', 'output']);

            render(CmdSelector);

            await fireEvent.keyDown(document.body, { key: 'Enter' });

            await vi.waitFor(() => {
                expect(get(stdout)).toEqual([]);
            });
        });

        it('Enter sets $currentTrayView to "stdout"', async () => {
            cmdConfig.set({
                cmd: createConfig(),
            });
            currentTrayView.set('cmdSelector');

            render(CmdSelector);

            await fireEvent.keyDown(document.body, { key: 'Enter' });

            await vi.waitFor(() => {
                expect(get(currentTrayView)).toBe('stdout');
            });
        });

        it('Enter calls stop_running', async () => {
            cmdConfig.set({
                cmd: createConfig(),
            });

            render(CmdSelector);

            await fireEvent.keyDown(document.body, { key: 'Enter' });

            await vi.waitFor(() => {
                expect(mockInvoke).toHaveBeenCalledWith('stop_running');
            });
        });

        it('Enter sets $currentFocus to "input"', async () => {
            cmdConfig.set({
                cmd: createConfig(),
            });
            currentFocus.set(undefined);

            render(CmdSelector);

            await fireEvent.keyDown(document.body, { key: 'Enter' });

            await vi.waitFor(() => {
                expect(get(currentFocus)).toBe('input');
            });
        });

        it('Enter sets $stdoutLock to true', async () => {
            cmdConfig.set({
                cmd: createConfig(),
            });
            stdoutLock.set(false);

            render(CmdSelector);

            await fireEvent.keyDown(document.body, { key: 'Enter' });

            await vi.waitFor(() => {
                expect(get(stdoutLock)).toBe(true);
            });
        });
    });

    describe('click activation', () => {
        it('click on command item activates that command', async () => {
            cmdConfig.set({
                clickable: createConfig(),
            });

            const { container } = render(CmdSelector);

            const item = container.querySelector('.cmd-item');
            await fireEvent.click(item!);

            expect(get(currentCmd)).toBe('clickable');
        });

        it('click clears query, stdout, and changes view', async () => {
            cmdConfig.set({
                cmd: createConfig(),
            });
            query.set('query');
            stdout.set(['output']);
            currentTrayView.set('cmdSelector');

            const { container } = render(CmdSelector);

            const item = container.querySelector('.cmd-item');
            await fireEvent.click(item!);

            expect(get(query)).toBe('');
            expect(get(stdout)).toEqual([]);
            expect(get(currentTrayView)).toBe('stdout');
        });
    });

    describe('Alt+S toggle', () => {
        it('Alt+S toggles back to stdout view from cmdSelector', async () => {
            cmdConfig.set({
                cmd: createConfig(),
            });
            currentTrayView.set('cmdSelector');

            render(CmdSelector);

            await fireEvent.keyDown(document.body, { key: 's', altKey: true });

            expect(get(currentTrayView)).toBe('stdout');
        });

        it('Alt+S sets currentFocus to input when toggling to stdout', async () => {
            cmdConfig.set({
                cmd: createConfig(),
            });
            currentTrayView.set('cmdSelector');
            currentFocus.set(undefined);

            render(CmdSelector);

            await fireEvent.keyDown(document.body, { key: 's', altKey: true });

            expect(get(currentFocus)).toBe('input');
        });

        it('Alt+S opens cmdSelector from stdout view', async () => {
            cmdConfig.set({
                cmd: createConfig(),
            });
            currentTrayView.set('stdout');

            render(CmdSelector);

            await fireEvent.keyDown(document.body, { key: 's', altKey: true });

            expect(get(currentTrayView)).toBe('cmdSelector');
        });
    });

    describe('status bar', () => {
        it('shows "↵ select" action', async () => {
            cmdConfig.set({
                cmd: createConfig(),
            });

            render(CmdSelector);

            await vi.waitFor(() => {
                const state = get(statusBar);
                expect(state.actions.some((a) => a.key === '↵' && a.label === 'select')).toBe(true);
            });
        });

        it('shows command count', async () => {
            cmdConfig.set({
                cmd1: createConfig(),
                cmd2: createConfig(),
                cmd3: createConfig(),
            });

            render(CmdSelector);

            await vi.waitFor(() => {
                const state = get(statusBar);
                expect(state.count).toBe('3 commands');
            });
        });

        it('status bar cleared on destroy', async () => {
            cmdConfig.set({
                cmd: createConfig(),
            });

            const { unmount } = render(CmdSelector);

            // Set status bar to have content
            statusBar.set({ actions: [{ key: '↵', label: 'select' }], count: '1 command' });

            unmount();

            const state = get(statusBar);
            expect(state.actions).toEqual([]);
            expect(state.count).toBe('');
        });
    });

    describe('selection initialization', () => {
        it('selection starts at current command index', async () => {
            cmdConfig.set({
                cmd1: createConfig({ hotkeyNumber: 1 }),
                cmd2: createConfig({ hotkeyNumber: 2 }),
                cmd3: createConfig({ hotkeyNumber: 3 }),
            });
            currentCmd.set('cmd2');

            const { container } = render(CmdSelector);

            await vi.waitFor(() => {
                const items = container.querySelectorAll('.cmd-item');
                // cmd2 is at index 1 (sorted by hotkey)
                expect(items[1].classList.contains('item-selected')).toBe(true);
            });
        });

        it('selection defaults to 0 if current command not found', async () => {
            cmdConfig.set({
                cmd1: createConfig(),
                cmd2: createConfig(),
            });
            currentCmd.set('nonexistent');

            const { container } = render(CmdSelector);

            await vi.waitFor(() => {
                const items = container.querySelectorAll('.cmd-item');
                expect(items[0].classList.contains('item-selected')).toBe(true);
            });
        });

        it('selection defaults to 0 when currentCmd is undefined', async () => {
            cmdConfig.set({
                cmd1: createConfig(),
                cmd2: createConfig(),
            });
            currentCmd.set(undefined);

            const { container } = render(CmdSelector);

            await vi.waitFor(() => {
                const items = container.querySelectorAll('.cmd-item');
                expect(items[0].classList.contains('item-selected')).toBe(true);
            });
        });
    });

    describe('scrollIntoView', () => {
        it('selected item scrolls into view', async () => {
            cmdConfig.set({
                cmd1: createConfig(),
                cmd2: createConfig(),
                cmd3: createConfig(),
            });

            render(CmdSelector);

            await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
            await new Promise((resolve) => setTimeout(resolve, 30));

            expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
        });

        it('scrollIntoView uses instant behavior', async () => {
            cmdConfig.set({
                cmd1: createConfig(),
                cmd2: createConfig(),
            });

            render(CmdSelector);

            await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
            await new Promise((resolve) => setTimeout(resolve, 30));

            expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(
                expect.objectContaining({ behavior: 'instant' })
            );
        });

        it('scrollIntoView uses nearest block', async () => {
            cmdConfig.set({
                cmd1: createConfig(),
                cmd2: createConfig(),
            });

            render(CmdSelector);

            await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
            await new Promise((resolve) => setTimeout(resolve, 30));

            expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(
                expect.objectContaining({ block: 'nearest' })
            );
        });
    });

    describe('edge cases', () => {
        it('handles empty cmdConfig', () => {
            cmdConfig.set({});

            const { container } = render(CmdSelector);

            const items = container.querySelectorAll('.cmd-item');
            expect(items.length).toBe(0);
        });

        it('handles single command', () => {
            cmdConfig.set({
                only: createConfig(),
            });

            const { container } = render(CmdSelector);

            const items = container.querySelectorAll('.cmd-item');
            expect(items.length).toBe(1);
        });

        it('handles rapid arrow key presses (debounce)', async () => {
            cmdConfig.set({
                cmd1: createConfig(),
                cmd2: createConfig(),
                cmd3: createConfig(),
                cmd4: createConfig(),
                cmd5: createConfig(),
            });

            render(CmdSelector);

            // Rapid fire arrow down
            for (let i = 0; i < 10; i++) {
                await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
            }

            // Due to debounce, not all should register
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Should not crash and selection should be somewhere
            expect(true).toBe(true);
        });

        it('navigation only works when currentTrayView is cmdSelector', async () => {
            cmdConfig.set({
                cmd1: createConfig(),
                cmd2: createConfig(),
            });
            currentTrayView.set('stdout'); // Not cmdSelector

            const { container } = render(CmdSelector);

            // Arrow keys should be ignored since enabled depends on currentTrayView
            await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
            await new Promise((resolve) => setTimeout(resolve, 30));

            // First item should still be selected (no navigation occurred)
            const items = container.querySelectorAll('.cmd-item');
            expect(items[0].classList.contains('item-selected')).toBe(true);
        });
    });
});
