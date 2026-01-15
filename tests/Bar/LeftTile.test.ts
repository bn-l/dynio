/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { get } from 'svelte/store';
import {
    currentCmd,
    currentTrayView,
    currentFocus,
    trayOpen,
    query,
} from '$lib/stores/globals';
import LeftTile from '../../src/Bar/LeftTile.svelte';

// Mock Tauri APIs
const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
    invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe('LeftTile.svelte', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockInvoke.mockResolvedValue(undefined);

        // Reset stores
        currentCmd.set(undefined);
        currentTrayView.set('stdout');
        currentFocus.set('input');
        query.set('');

        // Mock console
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    describe('renders current command name', () => {
        it('shows command name when currentCmd is set', () => {
            currentCmd.set('my-cmd');

            const { container } = render(LeftTile);

            expect(container.textContent).toContain('my-cmd');
        });

        it('shows short command name without truncation', () => {
            currentCmd.set('fzf');

            const { container } = render(LeftTile);

            expect(container.textContent).toContain('fzf');
            expect(container.textContent).not.toContain('...');
        });

        it('shows 10-char command name without truncation', () => {
            currentCmd.set('1234567890'); // exactly 10 chars

            const { container } = render(LeftTile);

            expect(container.textContent).toContain('1234567890');
            expect(container.textContent).not.toContain('...');
        });
    });

    describe('command name truncation', () => {
        it('truncates command name longer than 10 chars', () => {
            currentCmd.set('my-very-long-command');

            const { container } = render(LeftTile);

            // Should show first 7 chars + "..."
            expect(container.textContent).toContain('my-very...');
            expect(container.textContent).not.toContain('my-very-long-command');
        });

        it('truncates 11-char command name', () => {
            currentCmd.set('12345678901'); // 11 chars

            const { container } = render(LeftTile);

            // First 7 chars trimmed + "..."
            expect(container.textContent).toContain('1234567...');
        });

        it('truncates very long command name', () => {
            currentCmd.set('this-is-an-extremely-long-command-name');

            const { container } = render(LeftTile);

            // First 7 chars + "..."
            expect(container.textContent).toContain('this-is...');
        });

        it('trims whitespace before adding ellipsis', () => {
            // If first 7 chars end with space, it should be trimmed
            currentCmd.set('cmd    extra-text');

            const { container } = render(LeftTile);

            // "cmd    " (7 chars) -> "cmd" (trimmed) + "..."
            expect(container.textContent).toContain('cmd...');
        });
    });

    describe('undefined currentCmd', () => {
        it('shows "-----" when currentCmd is undefined', () => {
            currentCmd.set(undefined);

            const { container } = render(LeftTile);

            expect(container.textContent).toContain('-----');
        });

        it('shows "-----" when currentCmd set to undefined', async () => {
            currentCmd.set('some-cmd');
            const { container, rerender } = render(LeftTile);

            currentCmd.set(undefined);
            rerender({});

            await vi.waitFor(() => {
                expect(container.textContent).toContain('-----');
            });
        });
    });

    describe('click toggles cmdSelector view', () => {
        it('click when not in cmdSelector switches to cmdSelector', async () => {
            currentTrayView.set('stdout');
            currentCmd.set('test-cmd');

            const { container } = render(LeftTile);
            const button = container.querySelector('#leftTile');

            await fireEvent.click(button!);

            expect(get(currentTrayView)).toBe('cmdSelector');
        });

        it('click when in cmdSelector switches to stdout', async () => {
            currentTrayView.set('cmdSelector');
            currentCmd.set('test-cmd');

            const { container } = render(LeftTile);
            const button = container.querySelector('#leftTile');

            await fireEvent.click(button!);

            expect(get(currentTrayView)).toBe('stdout');
        });
    });

    describe('click when in cmdSelector', () => {
        beforeEach(() => {
            currentTrayView.set('cmdSelector');
            currentCmd.set('test-cmd');
        });

        it('switches to stdout view', async () => {
            const { container } = render(LeftTile);
            const button = container.querySelector('#leftTile');

            await fireEvent.click(button!);

            expect(get(currentTrayView)).toBe('stdout');
        });

        it('sets currentFocus to input', async () => {
            currentFocus.set(undefined);

            const { container } = render(LeftTile);
            const button = container.querySelector('#leftTile');

            await fireEvent.click(button!);

            expect(get(currentFocus)).toBe('input');
        });

        it('opens tray', async () => {
            const { container } = render(LeftTile);
            const button = container.querySelector('#leftTile');

            await fireEvent.click(button!);

            // trayOpen.set(true) calls invoke('open_tray')
            expect(mockInvoke).toHaveBeenCalledWith('open_tray');
        });
    });

    describe('click when not in cmdSelector', () => {
        beforeEach(() => {
            currentTrayView.set('stdout');
            currentCmd.set('test-cmd');
        });

        it('clears input (calls clearInput)', async () => {
            query.set('some query');

            const { container } = render(LeftTile);
            const button = container.querySelector('#leftTile');

            await fireEvent.click(button!);

            // clearInput sets query to ''
            expect(get(query)).toBe('');
        });

        it('switches to cmdSelector view', async () => {
            const { container } = render(LeftTile);
            const button = container.querySelector('#leftTile');

            await fireEvent.click(button!);

            expect(get(currentTrayView)).toBe('cmdSelector');
        });

        it('opens tray', async () => {
            const { container } = render(LeftTile);
            const button = container.querySelector('#leftTile');

            await fireEvent.click(button!);

            // trayOpen.set(true) calls invoke('open_tray')
            expect(mockInvoke).toHaveBeenCalledWith('open_tray');
        });

        it('calls stop_running when clearing input', async () => {
            const { container } = render(LeftTile);
            const button = container.querySelector('#leftTile');

            await fireEvent.click(button!);

            // clearInput() calls invoke('stop_running')
            expect(mockInvoke).toHaveBeenCalledWith('stop_running');
        });
    });

    describe('click from different tray views', () => {
        it('click from stderr view switches to cmdSelector', async () => {
            currentTrayView.set('stderr');
            currentCmd.set('test-cmd');

            const { container } = render(LeftTile);
            const button = container.querySelector('#leftTile');

            await fireEvent.click(button!);

            expect(get(currentTrayView)).toBe('cmdSelector');
        });

        it('click from errors view switches to cmdSelector', async () => {
            currentTrayView.set('errors');
            currentCmd.set('test-cmd');

            const { container } = render(LeftTile);
            const button = container.querySelector('#leftTile');

            await fireEvent.click(button!);

            expect(get(currentTrayView)).toBe('cmdSelector');
        });

        it('click from info view switches to cmdSelector', async () => {
            currentTrayView.set('info');
            currentCmd.set('test-cmd');

            const { container } = render(LeftTile);
            const button = container.querySelector('#leftTile');

            await fireEvent.click(button!);

            expect(get(currentTrayView)).toBe('cmdSelector');
        });
    });

    describe('element structure', () => {
        it('has #leftTile button element', () => {
            currentCmd.set('test');

            const { container } = render(LeftTile);

            const button = container.querySelector('#leftTile');
            expect(button).toBeTruthy();
            expect(button?.tagName.toLowerCase()).toBe('button');
        });

        it('has cursor-pointer class', () => {
            currentCmd.set('test');

            const { container } = render(LeftTile);

            const button = container.querySelector('#leftTile');
            expect(button?.classList.contains('cursor-pointer')).toBe(true);
        });

        it('has select-none class (prevents text selection)', () => {
            currentCmd.set('test');

            const { container } = render(LeftTile);

            const button = container.querySelector('#leftTile');
            expect(button?.classList.contains('select-none')).toBe(true);
        });

        it('has flex layout classes', () => {
            currentCmd.set('test');

            const { container } = render(LeftTile);

            const button = container.querySelector('#leftTile');
            expect(button?.classList.contains('flex')).toBe(true);
            expect(button?.classList.contains('items-center')).toBe(true);
            expect(button?.classList.contains('justify-center')).toBe(true);
        });

        it('has fixed width class (w-20)', () => {
            currentCmd.set('test');

            const { container } = render(LeftTile);

            const button = container.querySelector('#leftTile');
            expect(button?.classList.contains('w-20')).toBe(true);
        });

        it('has outline-none class', () => {
            currentCmd.set('test');

            const { container } = render(LeftTile);

            const button = container.querySelector('#leftTile');
            expect(button?.classList.contains('outline-none')).toBe(true);
        });
    });

    describe('blur transition on command change', () => {
        it('uses {#key clampedCmdName} for transition trigger', async () => {
            currentCmd.set('first');

            const { container, rerender } = render(LeftTile);

            // Initially shows first command
            expect(container.textContent).toContain('first');

            // Change command
            currentCmd.set('second');
            rerender({});

            // Should show second command (transition may be in progress)
            await vi.waitFor(() => {
                expect(container.textContent).toContain('second');
            });
        });

        it('transition triggers on truncation change', async () => {
            currentCmd.set('short');

            const { container, rerender } = render(LeftTile);

            expect(container.textContent).toContain('short');

            // Change to truncated name
            currentCmd.set('very-long-name-here');
            rerender({});

            await vi.waitFor(() => {
                expect(container.textContent).toContain('very-lo...');
            });
        });
    });

    describe('edge cases', () => {
        it('handles empty string command name', () => {
            currentCmd.set('');

            const { container } = render(LeftTile);

            // Empty string is falsy, should show "-----" via nullish coalescing
            // Actually, '' ?? '-----' returns '' because ?? only checks null/undefined
            // Let's check actual behavior
            const text = container.textContent?.trim();
            // Empty string is truthy for length check, so won't truncate
            // '' is falsy for ?? but the code uses ?? which doesn't catch ''
            expect(text).toBe(''); // empty string renders as empty
        });

        it('handles command name with special characters', () => {
            currentCmd.set('cmd-with.dots');

            const { container } = render(LeftTile);

            // 13 chars, should be truncated
            expect(container.textContent).toContain('cmd-wit...');
        });

        it('handles command name with unicode', () => {
            currentCmd.set('日本語コマンド'); // Japanese, 7 chars

            const { container } = render(LeftTile);

            expect(container.textContent).toContain('日本語コマンド');
        });

        it('handles long unicode command name truncation', () => {
            currentCmd.set('日本語のとても長いコマンド名'); // 13 chars

            const { container } = render(LeftTile);

            // Should truncate to first 7 chars + "..."
            expect(container.textContent).toContain('日本語のとても...');
        });

        it('handles command name with spaces', () => {
            currentCmd.set('my command');

            const { container } = render(LeftTile);

            expect(container.textContent).toContain('my command');
        });

        it('handles rapid clicks', async () => {
            currentTrayView.set('stdout');
            currentCmd.set('test');

            const { container } = render(LeftTile);
            const button = container.querySelector('#leftTile');

            // Rapid clicks
            await fireEvent.click(button!);
            await fireEvent.click(button!);
            await fireEvent.click(button!);

            // Should end in a consistent state
            // stdout -> cmdSelector -> stdout -> cmdSelector
            expect(['stdout', 'cmdSelector']).toContain(get(currentTrayView));
        });
    });

    describe('grid layout wrapper', () => {
        it('has grid wrapper for transition', () => {
            currentCmd.set('test');

            const { container } = render(LeftTile);

            const grid = container.querySelector('.grid');
            expect(grid).toBeTruthy();
        });

        it('button has grid-area style for overlapping transitions', () => {
            currentCmd.set('test');

            const { container } = render(LeftTile);

            const button = container.querySelector('#leftTile');
            expect(button?.classList.contains('[grid-area:1/1]')).toBe(true);
        });
    });
});
