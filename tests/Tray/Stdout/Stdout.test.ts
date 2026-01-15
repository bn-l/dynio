/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { get } from 'svelte/store';
import {
    stdout,
    stdoutLock,
    running,
    currentCmd,
} from '$lib/stores/globals';
import { cmdConfig } from '$lib/stores/cmd-config';
import type { CmdConfigItem } from '$lib/stores/schema/cmd-config-schema';
import Stdout from '../../../src/Tray/Stdout/Stdout.svelte';

// Mock Tauri APIs
const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
    invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
    writeText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
    openPath: vi.fn().mockResolvedValue(undefined),
}));

// Helper to create a minimal config
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

describe('Stdout.svelte - Section 31 Empty/Edge States', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockInvoke.mockResolvedValue(undefined);

        // Reset stores
        stdout.set([]);
        stdoutLock.set(false);
        running.set(false);
        currentCmd.set('test-cmd');
        cmdConfig.set({
            'test-cmd': createConfig(),
        });

        // Mock console
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'debug').mockImplementation(() => {});

        // Mock scrollIntoView
        Element.prototype.scrollIntoView = vi.fn();
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    describe('empty stdout with running state', () => {
        it('shows "No output" when stdout empty and running=false', () => {
            stdout.set([]);
            running.set(false);
            stdoutLock.set(false);

            const { container } = render(Stdout);

            const emptyDisplay = container.querySelector('#emptyDisplay');
            expect(emptyDisplay).toBeTruthy();
            expect(container.textContent).toContain('No output');
        });

        it('shows empty (no message) when stdout empty and running=true', () => {
            stdout.set([]);
            running.set(true);
            stdoutLock.set(false);

            const { container } = render(Stdout);

            const emptyDisplay = container.querySelector('#emptyDisplay');
            expect(emptyDisplay).toBeTruthy();
            // Should NOT contain "No output" message
            expect(container.textContent).not.toContain('No output');
        });
    });

    describe('stdoutLock behavior', () => {
        it('shows empty display with showBackground when stdoutLock=true', () => {
            stdoutLock.set(true);
            stdout.set([]);

            const { container } = render(Stdout);

            const emptyDisplay = container.querySelector('#emptyDisplay');
            expect(emptyDisplay).toBeTruthy();
            // When stdoutLock is true, message should be empty (background only)
            expect(container.textContent?.trim()).toBe('');
        });

        it('stdoutLock=true shows empty display even if stdout has content', () => {
            stdoutLock.set(true);
            stdout.set(['this should be ignored']);

            const { container } = render(Stdout);

            // EmptyDisplay should be shown, not the content
            const emptyDisplay = container.querySelector('#emptyDisplay');
            expect(emptyDisplay).toBeTruthy();
            expect(container.textContent).not.toContain('this should be ignored');
        });

        it('stdoutLock=false allows stdout content to be shown', () => {
            stdoutLock.set(false);
            stdout.set(['visible content']);

            const { container } = render(Stdout);

            // Content should be visible (in ListDisplay)
            expect(container.textContent).toContain('visible content');
        });
    });

    describe('display mode selection', () => {
        it('renders ListDisplay when mode=list', () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'list',
                        displayOptions: {},
                        activationOptions: {},
                    },
                }),
            });
            stdoutLock.set(false);
            stdout.set(['item1', 'item2']);

            const { container } = render(Stdout);

            const listDisplay = container.querySelector('#listDisplay');
            expect(listDisplay).toBeTruthy();
        });

        it('renders SingleDisplay when mode=single', () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'single',
                        displayOptions: {},
                        activationOptions: {},
                    },
                }),
            });
            stdoutLock.set(false);
            stdout.set(['single output']);

            const { container } = render(Stdout);

            const singleDisplay = container.querySelector('#singleDisplay');
            expect(singleDisplay).toBeTruthy();
        });

        it('renders LlmDisplay when mode=llm', () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: {},
                    },
                }),
            });
            stdoutLock.set(false);
            stdout.set(['llm response']);

            const { container } = render(Stdout);

            const llmDisplay = container.querySelector('#llmDisplay');
            expect(llmDisplay).toBeTruthy();
        });
    });

    describe('state transitions', () => {
        it('transitions from stdoutLock to content when lock released', async () => {
            stdoutLock.set(true);
            stdout.set(['content']);

            const { container, rerender } = render(Stdout);

            // Initially shows empty display due to lock
            expect(container.querySelector('#emptyDisplay')).toBeTruthy();

            // Release lock
            stdoutLock.set(false);
            rerender({ });

            // Now should show content
            await vi.waitFor(() => {
                expect(container.textContent).toContain('content');
            });
        });

        it('transitions from running to stopped shows "No output" if empty', async () => {
            running.set(true);
            stdout.set([]);
            stdoutLock.set(false);

            const { container, rerender } = render(Stdout);

            // Running with empty stdout shows empty (no message)
            expect(container.textContent).not.toContain('No output');

            // Stop running
            running.set(false);
            rerender({ });

            // Now should show "No output"
            await vi.waitFor(() => {
                expect(container.textContent).toContain('No output');
            });
        });
    });

    describe('undefined/edge cases', () => {
        it('handles undefined currentCmdConfig gracefully', () => {
            currentCmd.set(undefined);
            stdout.set(['some output']);
            stdoutLock.set(false);

            // Should not throw
            expect(() => render(Stdout)).not.toThrow();
        });

        it('handles command not in config gracefully', () => {
            currentCmd.set('nonexistent-command');
            cmdConfig.set({});
            stdout.set(['some output']);
            stdoutLock.set(false);

            // Should not throw
            expect(() => render(Stdout)).not.toThrow();
        });

        it('shows empty display with no message when cmdMode is undefined', () => {
            currentCmd.set('test-cmd');
            cmdConfig.set({
                'test-cmd': {
                    command: 'test',
                    modeConfig: undefined as unknown as CmdConfigItem['modeConfig'],
                },
            });
            stdout.set(['some output']);
            stdoutLock.set(false);

            const { container } = render(Stdout);

            // Falls through to default case (EmptyDisplay with no message)
            const emptyDisplay = container.querySelector('#emptyDisplay');
            expect(emptyDisplay).toBeTruthy();
        });
    });
});
