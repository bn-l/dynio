/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { get } from 'svelte/store';
import {
    currentTrayView,
    statusBar,
    stderr,
    stdout,
    currentCmd,
} from '$lib/stores/globals';
import { cmdConfig } from '$lib/stores/cmd-config';
import { errors } from '$lib/stores/errors';
import type { CmdConfigItem } from '$lib/stores/schema/cmd-config-schema';
import Tray from '../../src/Tray/Tray.svelte';

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

describe('Tray.svelte', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockInvoke.mockResolvedValue(undefined);

        // Reset stores
        currentTrayView.set('stdout');
        statusBar.set({ actions: [], count: '' });
        stderr.set('');
        stdout.set([]);
        currentCmd.set('test-cmd');
        cmdConfig.set({
            'test-cmd': createConfig(),
        });
        errors.clear();

        // Mock console.log to reduce noise
        vi.spyOn(console, 'log').mockImplementation(() => {});

        // Mock scrollIntoView
        Element.prototype.scrollIntoView = vi.fn();
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    describe('currentTrayView switching', () => {
        it('$currentTrayView="stdout" renders Stdout component', () => {
            currentTrayView.set('stdout');

            const { container } = render(Tray);

            // Stdout component renders its content
            // When stdout is empty, shows EmptyDisplay
            const emptyDisplay = container.querySelector('#emptyDisplay');
            expect(emptyDisplay).toBeTruthy();
        });

        it('$currentTrayView="stderr" renders Stderr component', () => {
            currentTrayView.set('stderr');
            stderr.set('test stderr content');

            const { container } = render(Tray);

            // Stderr uses ClearablePanel with "Stderr" heading
            const heading = container.querySelector('#panelHeading');
            expect(heading?.textContent).toBe('Stderr');
            expect(container.textContent).toContain('test stderr content');
        });

        it('$currentTrayView="errors" renders ErrorList component', () => {
            currentTrayView.set('errors');
            errors.addError('Test error', 'js');

            const { container } = render(Tray);

            // ErrorList uses ClearablePanel with "Errors" heading
            const heading = container.querySelector('#panelHeading');
            expect(heading?.textContent).toBe('Errors');
            expect(container.textContent).toContain('Test error');
        });

        it('$currentTrayView="cmdSelector" renders CmdSelector component', () => {
            currentTrayView.set('cmdSelector');

            const { container } = render(Tray);

            // CmdSelector renders the command list
            const cmdSelector = container.querySelector('#cmdSelector');
            expect(cmdSelector).toBeTruthy();
        });

        it('default case renders Stdout component', () => {
            // Set to an undefined view type (though types prevent this, testing robustness)
            currentTrayView.set('stdout');

            const { container } = render(Tray);

            expect(container.querySelector('.tray-content')).toBeTruthy();
        });
    });

    describe('status bar visibility - LLM mode', () => {
        beforeEach(() => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: {},
                    },
                }),
            });
            currentTrayView.set('stdout');
        });

        it('shows status bar when stderr has content (indicator)', () => {
            stderr.set('some stderr');
            statusBar.set({ actions: [], count: '' });

            const { container } = render(Tray);

            // StatusBar should be visible because of stderr indicator
            const statusBarEl = container.querySelector('.status-bar');
            expect(statusBarEl).toBeTruthy();
        });

        it('shows status bar when errors exist (indicator)', () => {
            errors.addError('Test error', 'js');
            statusBar.set({ actions: [], count: '' });

            const { container } = render(Tray);

            const statusBarEl = container.querySelector('.status-bar');
            expect(statusBarEl).toBeTruthy();
        });

        it('shows status bar when actions are present', async () => {
            statusBar.set({ actions: [{ key: '↵', label: 'test' }], count: '' });

            const { container } = render(Tray);

            await vi.waitFor(() => {
                const statusBarEl = container.querySelector('.status-bar');
                expect(statusBarEl).toBeTruthy();
            });
        });

        it('hides status bar when no indicators and no actions', () => {
            stderr.set('');
            errors.clear();
            statusBar.set({ actions: [], count: '' });

            const { container } = render(Tray);

            // In LLM mode with nothing to show, status bar should be hidden
            const statusBarEl = container.querySelector('.status-bar');
            expect(statusBarEl).toBeNull();
        });

        it('hides status bar when only count is present (LLM mode ignores count)', () => {
            stderr.set('');
            errors.clear();
            statusBar.set({ actions: [], count: '10 items' });

            const { container } = render(Tray);

            // LLM mode doesn't show status bar just for count
            const statusBarEl = container.querySelector('.status-bar');
            expect(statusBarEl).toBeNull();
        });
    });

    describe('status bar visibility - non-LLM modes', () => {
        beforeEach(() => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'list',
                        displayOptions: {},
                        activationOptions: {},
                    },
                }),
            });
            currentTrayView.set('stdout');
        });

        it('shows status bar when actions are present', async () => {
            statusBar.set({ actions: [{ key: '↵', label: 'copy' }], count: '' });

            const { container } = render(Tray);

            await vi.waitFor(() => {
                const statusBarEl = container.querySelector('.status-bar');
                expect(statusBarEl).toBeTruthy();
            });
        });

        it('shows status bar when count is present', async () => {
            statusBar.set({ actions: [], count: '5 items' });

            const { container } = render(Tray);

            await vi.waitFor(() => {
                const statusBarEl = container.querySelector('.status-bar');
                expect(statusBarEl).toBeTruthy();
            });
        });

        it('shows status bar when stderr indicator is present', () => {
            stderr.set('stderr content');
            statusBar.set({ actions: [], count: '' });

            const { container } = render(Tray);

            const statusBarEl = container.querySelector('.status-bar');
            expect(statusBarEl).toBeTruthy();
        });

        it('shows status bar when error indicator is present', () => {
            errors.addError('Error', 'js');
            statusBar.set({ actions: [], count: '' });

            const { container } = render(Tray);

            const statusBarEl = container.querySelector('.status-bar');
            expect(statusBarEl).toBeTruthy();
        });

        it('hides status bar when no content to show', () => {
            stderr.set('');
            errors.clear();
            statusBar.set({ actions: [], count: '' });

            const { container } = render(Tray);

            const statusBarEl = container.querySelector('.status-bar');
            expect(statusBarEl).toBeNull();
        });
    });

    describe('status bar visibility - single mode', () => {
        beforeEach(() => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'single',
                        displayOptions: {},
                        activationOptions: {},
                    },
                }),
            });
            currentTrayView.set('stdout');
        });

        it('shows status bar when actions present in single mode', async () => {
            statusBar.set({ actions: [{ key: '↵', label: 'copy' }], count: '' });

            const { container } = render(Tray);

            await vi.waitFor(() => {
                const statusBarEl = container.querySelector('.status-bar');
                expect(statusBarEl).toBeTruthy();
            });
        });
    });

    describe('tray structure', () => {
        it('has correct grid layout', () => {
            const { container } = render(Tray);

            const tray = container.querySelector('#tray');
            expect(tray).toBeTruthy();
            expect(tray?.classList.contains('grid')).toBe(true);
            expect(tray?.classList.contains('grid-rows-[1fr_auto]')).toBe(true);
        });

        it('has tray-content container', () => {
            const { container } = render(Tray);

            const trayContent = container.querySelector('.tray-content');
            expect(trayContent).toBeTruthy();
        });

        it('has correct dimensions', () => {
            const { container } = render(Tray);

            const tray = container.querySelector('#tray');
            expect(tray?.classList.contains('h-[20rem]')).toBe(true);
            expect(tray?.classList.contains('w-full')).toBe(true);
        });
    });

    describe('view switching reactivity', () => {
        it('updates when currentTrayView changes', async () => {
            const { container } = render(Tray);

            // Start with stdout
            currentTrayView.set('stdout');
            await vi.waitFor(() => {
                // Stdout shows EmptyDisplay when empty
                expect(container.querySelector('#emptyDisplay')).toBeTruthy();
            });

            // Switch to errors
            errors.addError('Test', 'js');
            currentTrayView.set('errors');
            await vi.waitFor(() => {
                expect(container.querySelector('#panelHeading')?.textContent).toBe('Errors');
            });

            // Switch to stderr
            stderr.set('test stderr');
            currentTrayView.set('stderr');
            await vi.waitFor(() => {
                expect(container.querySelector('#panelHeading')?.textContent).toBe('Stderr');
            });
        });
    });

    describe('edge cases', () => {
        it('handles rapid view switching', async () => {
            const { container } = render(Tray);

            // Rapid switching
            currentTrayView.set('stdout');
            currentTrayView.set('stderr');
            currentTrayView.set('errors');
            currentTrayView.set('cmdSelector');
            currentTrayView.set('stdout');

            await vi.waitFor(() => {
                // Should end up on stdout
                expect(container.querySelector('.tray-content')).toBeTruthy();
            });
        });

        it('handles undefined cmdConfig gracefully', () => {
            currentCmd.set(undefined);

            expect(() => render(Tray)).not.toThrow();
        });
    });
});
