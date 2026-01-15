/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { stdout, statusBar, keySymbols, currentCmd } from '$lib/stores/globals';
import { cmdConfig } from '$lib/stores/cmd-config';
import type { CmdConfigItem } from '$lib/stores/schema/cmd-config-schema';
import ListDisplay from './ListDisplay.svelte';

// Mock Tauri APIs
const mockInvoke = vi.fn();
const mockWriteText = vi.fn();
const mockOpenPath = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
    invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
    writeText: (...args: unknown[]) => mockWriteText(...args),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
    openPath: (...args: unknown[]) => mockOpenPath(...args),
}));

// Helper function to create a minimal config
function createConfig(overrides: Partial<CmdConfigItem> = {}): CmdConfigItem {
    return {
        program: 'test',
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

describe('ListDisplay.svelte', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockInvoke.mockResolvedValue(undefined);
        mockWriteText.mockResolvedValue(undefined);
        mockOpenPath.mockResolvedValue(undefined);

        // Reset stores
        stdout.set([]);
        statusBar.set({ actions: [], count: '' });
        currentCmd.set('test-cmd');
        cmdConfig.set({
            'test-cmd': createConfig(),
        });

        // Mock console.log to reduce noise
        vi.spyOn(console, 'log').mockImplementation(() => {});

        // Mock scrollIntoView
        Element.prototype.scrollIntoView = vi.fn();
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    describe('rendering items', () => {
        it('renders items from $stdout', () => {
            stdout.set(['item1', 'item2', 'item3']);

            const { container } = render(ListDisplay);

            const items = container.querySelectorAll('.list-item');
            expect(items).toHaveLength(3);
        });

        it('renders empty list when stdout is empty', () => {
            stdout.set([]);

            const { container } = render(ListDisplay);

            const items = container.querySelectorAll('.list-item');
            expect(items).toHaveLength(0);
        });

        it('displays item text content', () => {
            stdout.set(['Hello World']);

            const { container } = render(ListDisplay);

            expect(container.textContent).toContain('Hello World');
        });

        it('applies fontSize from displayOptions', () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'list',
                        displayOptions: { fontSize: 1.5 },
                        activationOptions: {},
                    },
                }),
            });
            stdout.set(['test']);

            const { container } = render(ListDisplay);

            const listDisplay = container.querySelector('#listDisplay');
            expect(listDisplay?.getAttribute('style')).toContain('font-size: 1.5rem');
        });

        it('does not apply fontSize style when not specified', () => {
            stdout.set(['test']);

            const { container } = render(ListDisplay);

            const listDisplay = container.querySelector('#listDisplay');
            expect(listDisplay?.getAttribute('style')).toBe('');
        });
    });

    describe('parseAnsiColors option', () => {
        it('uses {@html} when parseAnsiColors is true', () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'list',
                        displayOptions: { parseAnsiColors: true },
                        activationOptions: {},
                    },
                }),
            });
            // ANSI red text - will be converted to HTML with span
            stdout.set(['\x1b[31mred text\x1b[0m']);

            const { container } = render(ListDisplay);

            // When parseAnsiColors is true, ANSI codes are converted to HTML spans
            expect(container.innerHTML).toContain('<span');
        });

        it('uses text node when parseAnsiColors is false', () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'list',
                        displayOptions: { parseAnsiColors: false },
                        activationOptions: {},
                    },
                }),
            });
            stdout.set(['plain text']);

            const { container } = render(ListDisplay);

            expect(container.textContent).toContain('plain text');
        });
    });

    describe('item selection', () => {
        it('first item is selected by default', () => {
            stdout.set(['item1', 'item2', 'item3']);

            const { container } = render(ListDisplay);

            const firstItem = container.querySelector('#item-0');
            expect(firstItem?.classList.contains('item-selected')).toBe(true);
        });

        it('non-selected items have item-hover class', () => {
            stdout.set(['item1', 'item2', 'item3']);

            const { container } = render(ListDisplay);

            const secondItem = container.querySelector('#item-1');
            expect(secondItem?.classList.contains('item-hover')).toBe(true);
        });
    });

    describe('click activation', () => {
        it('click on item triggers activation with item text', async () => {
            stdout.set(['clickable item']);

            const { container } = render(ListDisplay);

            const itemInner = container.querySelector('.list-item-inner');
            await fireEvent.click(itemInner!);

            expect(mockWriteText).toHaveBeenCalledWith('clickable item');
        });

        it('click sets selectedIndex to clicked item', async () => {
            stdout.set(['item1', 'item2', 'item3']);

            const { container } = render(ListDisplay);

            const secondItemInner = container.querySelectorAll('.list-item-inner')[1];
            await fireEvent.click(secondItemInner);

            // After click, second item should be selected
            const secondItem = container.querySelector('#item-1');
            expect(secondItem?.classList.contains('item-selected')).toBe(true);
        });
    });

    describe('right-click (context menu)', () => {
        it('right-click triggers activation with openContaining=true', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'list',
                        displayOptions: {},
                        activationOptions: {
                            activateAction: 'open',
                            isPath: true,
                        },
                    },
                }),
            });
            stdout.set(['/path/to/file.txt']);
            mockInvoke.mockImplementation((cmd: string) => {
                if (cmd === 'trim_path') return Promise.resolve('/path/to');
                return Promise.resolve(undefined);
            });

            const { container } = render(ListDisplay);

            const itemInner = container.querySelector('.list-item-inner');
            await fireEvent.contextMenu(itemInner!);

            // Should call trim_path for openContaining
            expect(mockInvoke).toHaveBeenCalledWith('trim_path', { path: '/path/to/file.txt' });
        });

        it('right-click prevents context menu', async () => {
            stdout.set(['item']);

            const { container } = render(ListDisplay);

            const itemInner = container.querySelector('.list-item-inner');
            const event = new MouseEvent('contextmenu', { bubbles: true });
            const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

            itemInner?.dispatchEvent(event);

            expect(preventDefaultSpy).toHaveBeenCalled();
        });
    });

    describe('status bar updates', () => {
        it('updates status bar with copy action when activateAction is copy', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'list',
                        displayOptions: {},
                        activationOptions: { activateAction: 'copy' },
                    },
                }),
            });
            stdout.set(['item']);

            render(ListDisplay);

            // Wait for reactive statement to run
            await vi.waitFor(() => {
                const state = get(statusBar);
                expect(state.actions.some((a) => a.label === 'copy')).toBe(true);
            });
        });

        it('updates status bar with open action when activateAction is open', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'list',
                        displayOptions: {},
                        activationOptions: { activateAction: 'open' },
                    },
                }),
            });
            stdout.set(['item']);

            render(ListDisplay);

            await vi.waitFor(() => {
                const state = get(statusBar);
                expect(state.actions.some((a) => a.label === 'open')).toBe(true);
            });
        });

        it('shows enter key when runOnEnter is false', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    runOnEnter: false,
                }),
            });
            stdout.set(['item']);

            render(ListDisplay);

            await vi.waitFor(() => {
                const state = get(statusBar);
                expect(state.actions.some((a) => a.key === keySymbols.enter)).toBe(true);
            });
        });

        it('shows Cmd+Enter when runOnEnter is true', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    runOnEnter: true,
                }),
            });
            stdout.set(['item']);

            render(ListDisplay);

            await vi.waitFor(() => {
                const state = get(statusBar);
                expect(state.actions.some((a) => a.key.includes(keySymbols.cmd))).toBe(true);
            });
        });

        it('shows Cmd+O reveal action when isPath is true', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'list',
                        displayOptions: {},
                        activationOptions: { isPath: true },
                    },
                }),
            });
            stdout.set(['item']);

            render(ListDisplay);

            await vi.waitFor(() => {
                const state = get(statusBar);
                expect(state.actions.some((a) => a.label === 'reveal')).toBe(true);
            });
        });

        it('does not show reveal action when isPath is false', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'list',
                        displayOptions: {},
                        activationOptions: { isPath: false },
                    },
                }),
            });
            stdout.set(['item']);

            render(ListDisplay);

            await vi.waitFor(() => {
                const state = get(statusBar);
                expect(state.actions.every((a) => a.label !== 'reveal')).toBe(true);
            });
        });

        it('shows item count when hideCount is false', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'list',
                        displayOptions: { hideCount: false },
                        activationOptions: {},
                    },
                }),
            });
            stdout.set(['item1', 'item2', 'item3']);

            render(ListDisplay);

            await vi.waitFor(() => {
                const state = get(statusBar);
                expect(state.count).toBe('3 items');
            });
        });

        it('hides count when hideCount is true', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'list',
                        displayOptions: { hideCount: true },
                        activationOptions: {},
                    },
                }),
            });
            stdout.set(['item1', 'item2', 'item3']);

            render(ListDisplay);

            await vi.waitFor(() => {
                const state = get(statusBar);
                expect(state.count).toBe('');
            });
        });
    });

    describe('onDestroy cleanup', () => {
        it('clears status bar on destroy', async () => {
            stdout.set(['item']);

            const { unmount } = render(ListDisplay);

            // Set some status bar state
            statusBar.set({ actions: [{ key: '↵', label: 'copy' }], count: '1 item' });

            unmount();

            // Status bar should be cleared
            const state = get(statusBar);
            expect(state.actions).toEqual([]);
            expect(state.count).toBe('');
        });
    });

    describe('edge cases', () => {
        it('handles empty list without crash', () => {
            stdout.set([]);

            expect(() => render(ListDisplay)).not.toThrow();
        });

        it('handles single item in list', () => {
            stdout.set(['single']);

            const { container } = render(ListDisplay);

            const items = container.querySelectorAll('.list-item');
            expect(items).toHaveLength(1);
        });

        it('selected item scrolls into view on navigation', async () => {
            stdout.set(['item1', 'item2', 'item3']);

            render(ListDisplay);

            // Navigate down to trigger scrollIntoView - the reactive statement
            // calls scrollIntoView when selectedIndex changes
            await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
            await new Promise((resolve) => setTimeout(resolve, 30));

            // scrollIntoView should have been called (mocked on Element.prototype)
            expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
        });
    });

    describe('arrow key navigation', () => {
        // These tests verify the debounce and handler setup
        // The actual hotkeys action is tested separately in hotkeys.test.ts

        it('arrow down increases selectedIndex (debounced)', async () => {
            stdout.set(['item1', 'item2', 'item3']);

            const { container } = render(ListDisplay);

            // Dispatch ArrowDown event on body
            await fireEvent.keyDown(document.body, { key: 'ArrowDown' });

            // Wait for debounce (16ms)
            await new Promise((resolve) => setTimeout(resolve, 30));

            // After arrow down, second item should be selected
            await vi.waitFor(() => {
                const secondItem = container.querySelector('#item-1');
                expect(secondItem?.classList.contains('item-selected')).toBe(true);
            });
        });

        it('arrow up decreases selectedIndex (debounced)', async () => {
            stdout.set(['item1', 'item2', 'item3']);

            const { container } = render(ListDisplay);

            // First go down to item 1
            await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
            await new Promise((resolve) => setTimeout(resolve, 30));

            // Then go back up
            await fireEvent.keyDown(document.body, { key: 'ArrowUp' });
            await new Promise((resolve) => setTimeout(resolve, 30));

            // First item should be selected again
            await vi.waitFor(() => {
                const firstItem = container.querySelector('#item-0');
                expect(firstItem?.classList.contains('item-selected')).toBe(true);
            });
        });

        it('arrow up at index 0 stays at 0', async () => {
            stdout.set(['item1', 'item2']);

            const { container } = render(ListDisplay);

            // Try to go up from 0
            await fireEvent.keyDown(document.body, { key: 'ArrowUp' });
            await new Promise((resolve) => setTimeout(resolve, 30));

            // First item should still be selected
            const firstItem = container.querySelector('#item-0');
            expect(firstItem?.classList.contains('item-selected')).toBe(true);
        });

        it('arrow down at last item stays at last', async () => {
            stdout.set(['item1', 'item2']);

            const { container } = render(ListDisplay);

            // Go to last item
            await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
            await new Promise((resolve) => setTimeout(resolve, 30));

            // Try to go down again
            await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
            await new Promise((resolve) => setTimeout(resolve, 30));

            // Last item should still be selected
            await vi.waitFor(() => {
                const lastItem = container.querySelector('#item-1');
                expect(lastItem?.classList.contains('item-selected')).toBe(true);
            });
        });
    });

    describe('Enter key activation', () => {
        it('Enter key activates selected item when runOnEnter is false', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    runOnEnter: false,
                }),
            });
            stdout.set(['activate-me']);

            render(ListDisplay);

            await fireEvent.keyDown(document.body, { key: 'Enter' });

            // Wait for handler to execute
            await vi.waitFor(() => {
                expect(mockWriteText).toHaveBeenCalledWith('activate-me');
            });
        });

        it('Enter key does NOT activate when runOnEnter is true', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    runOnEnter: true,
                }),
            });
            stdout.set(['do-not-activate']);

            render(ListDisplay);

            await fireEvent.keyDown(document.body, { key: 'Enter' });
            await new Promise((resolve) => setTimeout(resolve, 50));

            // writeText should not be called
            expect(mockWriteText).not.toHaveBeenCalled();
        });

        it('Cmd/Ctrl+Enter activates regardless of runOnEnter', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    runOnEnter: true, // Would normally prevent Enter activation
                }),
            });
            stdout.set(['force-activate']);

            render(ListDisplay);

            await fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true });

            await vi.waitFor(() => {
                expect(mockWriteText).toHaveBeenCalledWith('force-activate');
            });
        });
    });

    describe('Cmd/Ctrl+O reveal', () => {
        it('Cmd/Ctrl+O reveals containing folder when isPath is true', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'list',
                        displayOptions: {},
                        activationOptions: {
                            activateAction: 'open',
                            isPath: true,
                        },
                    },
                }),
            });
            stdout.set(['/path/to/file.txt']);
            mockInvoke.mockImplementation((cmd: string) => {
                if (cmd === 'trim_path') return Promise.resolve('/path/to');
                return Promise.resolve(undefined);
            });

            render(ListDisplay);

            await fireEvent.keyDown(document.body, { key: 'o', ctrlKey: true });

            await vi.waitFor(() => {
                expect(mockInvoke).toHaveBeenCalledWith('trim_path', { path: '/path/to/file.txt' });
            });
        });

        it('Cmd/Ctrl+O does nothing when isPath is false', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'list',
                        displayOptions: {},
                        activationOptions: {
                            isPath: false,
                        },
                    },
                }),
            });
            stdout.set(['not a path']);

            render(ListDisplay);

            await fireEvent.keyDown(document.body, { key: 'o', ctrlKey: true });
            await new Promise((resolve) => setTimeout(resolve, 50));

            // trim_path should not be called
            expect(mockInvoke).not.toHaveBeenCalledWith('trim_path', expect.anything());
        });
    });
});
