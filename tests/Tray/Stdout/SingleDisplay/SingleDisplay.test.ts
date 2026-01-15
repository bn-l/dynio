/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { stdout, statusBar, keySymbols, currentCmd } from '$lib/stores/globals';
import { cmdConfig } from '$lib/stores/cmd-config';
import type { CmdConfigItem } from '$lib/stores/schema/cmd-config-schema';
import SingleDisplay from '../../../../src/Tray/Stdout/SingleDisplay/SingleDisplay.svelte';

// Mock Tauri APIs
const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
    invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Helper function to create a minimal config for single mode
function createConfig(overrides: Partial<CmdConfigItem> = {}): CmdConfigItem {
    return {
        program: 'test',
        modeConfig: {
            mode: 'single',
            displayOptions: {},
            activationOptions: {
                activateAction: 'copy',
            },
        },
        ...overrides,
    };
}

describe('SingleDisplay.svelte', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockInvoke.mockResolvedValue(undefined);

        // Reset stores
        stdout.set([]);
        statusBar.set({ actions: [], count: '' });
        currentCmd.set('test-cmd');
        cmdConfig.set({
            'test-cmd': createConfig(),
        });

        // Mock console.log to reduce noise
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    describe('rendering output', () => {
        it('renders processed output', () => {
            stdout.set(['Hello World']);

            const { container } = render(SingleDisplay);

            expect(container.textContent).toContain('Hello World');
        });

        it('joins multiple stdout lines', () => {
            stdout.set(['line1', 'line2', 'line3']);

            const { container } = render(SingleDisplay);

            expect(container.textContent).toContain('line1');
            expect(container.textContent).toContain('line2');
            expect(container.textContent).toContain('line3');
        });

        it('renders empty content for empty stdout', () => {
            stdout.set([]);

            const { container } = render(SingleDisplay);

            const display = container.querySelector('#singleDisplay');
            expect(display).toBeTruthy();
        });
    });

    describe('dynamic font sizing', () => {
        it('uses largeSize when output length < sizeBreakPoint', () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'single',
                        displayOptions: {
                            sizeBreakPoint: 100,
                            largeSize: 2.5,
                            smallSize: 1.0,
                        },
                        activationOptions: {},
                    },
                }),
            });
            stdout.set(['short']); // 5 chars < 100

            const { container } = render(SingleDisplay);

            const display = container.querySelector('#singleDisplay');
            expect(display?.getAttribute('style')).toContain('font-size: 2.5rem');
        });

        it('uses smallSize when output length >= sizeBreakPoint', () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'single',
                        displayOptions: {
                            sizeBreakPoint: 10,
                            largeSize: 2.5,
                            smallSize: 1.0,
                        },
                        activationOptions: {},
                    },
                }),
            });
            stdout.set(['this is a much longer string that exceeds breakpoint']); // > 10 chars

            const { container } = render(SingleDisplay);

            const display = container.querySelector('#singleDisplay');
            expect(display?.getAttribute('style')).toContain('font-size: 1rem');
        });

        it('uses smallSize when exactly at sizeBreakPoint', () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'single',
                        displayOptions: {
                            sizeBreakPoint: 10,
                            largeSize: 2.5,
                            smallSize: 1.2,
                        },
                        activationOptions: {},
                    },
                }),
            });
            stdout.set(['0123456789']); // exactly 10 chars

            const { container } = render(SingleDisplay);

            const display = container.querySelector('#singleDisplay');
            // >= breakpoint means smallSize
            expect(display?.getAttribute('style')).toContain('font-size: 1.2rem');
        });

        it('handles undefined font sizing options gracefully', () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'single',
                        displayOptions: {},
                        activationOptions: {},
                    },
                }),
            });
            stdout.set(['test content']);

            // Should not crash
            expect(() => render(SingleDisplay)).not.toThrow();
        });
    });

    describe('status bar updates', () => {
        it('shows copy action when activateAction is copy', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'single',
                        displayOptions: {},
                        activationOptions: { activateAction: 'copy' },
                    },
                }),
            });
            stdout.set(['content']);

            render(SingleDisplay);

            await vi.waitFor(() => {
                const state = get(statusBar);
                expect(state.actions.some((a) => a.label === 'copy')).toBe(true);
            });
        });

        it('shows open action when activateAction is open', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'single',
                        displayOptions: {},
                        activationOptions: { activateAction: 'open' },
                    },
                }),
            });
            stdout.set(['content']);

            render(SingleDisplay);

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
            stdout.set(['content']);

            render(SingleDisplay);

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
            stdout.set(['content']);

            render(SingleDisplay);

            await vi.waitFor(() => {
                const state = get(statusBar);
                expect(state.actions.some((a) => a.key.includes(keySymbols.cmd))).toBe(true);
            });
        });

        it('shows Cmd+O reveal when isPath is true', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'single',
                        displayOptions: {},
                        activationOptions: { isPath: true },
                    },
                }),
            });
            stdout.set(['content']);

            render(SingleDisplay);

            await vi.waitFor(() => {
                const state = get(statusBar);
                expect(state.actions.some((a) => a.label === 'reveal')).toBe(true);
            });
        });

        it('does not show reveal when isPath is false', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'single',
                        displayOptions: {},
                        activationOptions: { isPath: false },
                    },
                }),
            });
            stdout.set(['content']);

            render(SingleDisplay);

            await vi.waitFor(() => {
                const state = get(statusBar);
                expect(state.actions.every((a) => a.label !== 'reveal')).toBe(true);
            });
        });

        it('does not show item count (single mode has no count)', async () => {
            stdout.set(['content']);

            render(SingleDisplay);

            await vi.waitFor(() => {
                const state = get(statusBar);
                expect(state.count).toBe('');
            });
        });
    });

    describe('parseAnsiColors option', () => {
        it('uses {@html} when parseAnsiColors is true', () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'single',
                        displayOptions: { parseAnsiColors: true },
                        activationOptions: {},
                    },
                }),
            });
            // ANSI red text
            stdout.set(['\x1b[31mred text\x1b[0m']);

            const { container } = render(SingleDisplay);

            // When parseAnsiColors is true, ANSI codes are converted to HTML spans
            expect(container.innerHTML).toContain('<span');
            expect(container.textContent).toContain('red text');
        });

        it('uses plain text when parseAnsiColors is false', () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'single',
                        displayOptions: { parseAnsiColors: false },
                        activationOptions: {},
                    },
                }),
            });
            stdout.set(['plain text']);

            const { container } = render(SingleDisplay);

            expect(container.textContent).toContain('plain text');
        });

        it('renders multi-line content correctly', () => {
            stdout.set(['line 1', 'line 2', 'line 3']);

            const { container } = render(SingleDisplay);

            // All lines should be present (joined with newlines by processSingleOutput)
            expect(container.textContent).toContain('line 1');
            expect(container.textContent).toContain('line 2');
            expect(container.textContent).toContain('line 3');
        });
    });

    describe('onDestroy cleanup', () => {
        it('clears status bar on destroy', async () => {
            stdout.set(['content']);

            const { unmount } = render(SingleDisplay);

            // Set some status bar state
            statusBar.set({ actions: [{ key: '↵', label: 'copy' }], count: '' });

            unmount();

            // Status bar should be cleared
            const state = get(statusBar);
            expect(state.actions).toEqual([]);
            expect(state.count).toBe('');
        });
    });

    describe('JSON processing', () => {
        it('pretty prints JSON when json option is true', () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'single',
                        displayOptions: { json: true },
                        activationOptions: {},
                    },
                }),
            });
            stdout.set(['{"key":"value"}']);

            const { container } = render(SingleDisplay);

            // Pretty-printed JSON should have indentation
            expect(container.textContent).toContain('key');
            expect(container.textContent).toContain('value');
        });

        it('extracts jsonPath when specified', () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'single',
                        displayOptions: {
                            json: true,
                            jsonPath: 'data.value',
                        },
                        activationOptions: {},
                    },
                }),
            });
            stdout.set(['{"data":{"value":"extracted"}}']);

            const { container } = render(SingleDisplay);

            expect(container.textContent).toContain('extracted');
        });
    });

    describe('edge cases', () => {
        it('handles empty stdout array', () => {
            stdout.set([]);

            expect(() => render(SingleDisplay)).not.toThrow();
        });

        it('handles very long content', () => {
            const longContent = 'x'.repeat(10000);
            stdout.set([longContent]);

            const { container } = render(SingleDisplay);

            expect(container.textContent).toContain('x');
        });

        it('handles unicode content', () => {
            stdout.set(['日本語テスト 🎉']);

            const { container } = render(SingleDisplay);

            expect(container.textContent).toContain('日本語テスト 🎉');
        });

        it('handles special characters', () => {
            stdout.set(['<script>alert("xss")</script>']);

            const { container } = render(SingleDisplay);

            // Should not execute script (rendered as text or escaped)
            expect(container.querySelector('script')).toBeNull();
        });
    });

    describe('font sizing with ANSI codes', () => {
        it('strips ANSI codes before calculating length for font sizing', () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'single',
                        displayOptions: {
                            sizeBreakPoint: 10,
                            largeSize: 2.0,
                            smallSize: 1.0,
                        },
                        activationOptions: {},
                    },
                }),
            });
            // ANSI codes add characters but shouldn't count toward length
            // "short" = 5 chars, but with ANSI codes it would be much longer
            stdout.set(['\x1b[31mshort\x1b[0m']);

            const { container } = render(SingleDisplay);

            const display = container.querySelector('#singleDisplay');
            // Should use largeSize because actual text "short" (5 chars) < 10
            expect(display?.getAttribute('style')).toContain('font-size: 2rem');
        });
    });
});
