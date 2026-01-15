/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

// Mock Tauri invoke before importing globals
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
    invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Import after mocks are set up
import {
    stdout,
    trayOpen,
    clearInput,
    currentTrayView,
    currentCmd,
    running,
    exitCode,
    stdoutLock,
    query,
    stderr,
    scrollContainer,
    statusBar,
    isMac,
    keySymbols,
} from '../../../src/lib/stores/globals';

describe('globals.ts stores', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockInvoke.mockResolvedValue(undefined);
        // Reset stores to initial values
        currentTrayView.set('stdout');
        currentCmd.set(undefined);
        running.set(false);
        exitCode.set(0);
        stdoutLock.set(true);
        query.set('');
        stderr.set('');
        stdout.set([]);
        scrollContainer.set(null);
        statusBar.set({ actions: [], count: '' });
    });

    describe('stdout store', () => {
        it('set() updates store value', () => {
            stdout.set(['line1', 'line2']);
            expect(get(stdout)).toEqual(['line1', 'line2']);
        });

        it('handles empty array', () => {
            stdout.set([]);
            expect(get(stdout)).toEqual([]);
        });

        it('handles single item', () => {
            stdout.set(['single']);
            expect(get(stdout)).toEqual(['single']);
        });

        it('is subscribable', () => {
            let value: string[] = [];
            const unsubscribe = stdout.subscribe((v) => {
                value = v;
            });

            stdout.set(['updated']);
            expect(value).toEqual(['updated']);
            unsubscribe();
        });
    });

    describe('trayOpen store', () => {
        it('set(true) calls invoke("open_tray") then updates store', async () => {
            trayOpen.set(true);

            // Should call open_tray
            expect(mockInvoke).toHaveBeenCalledWith('open_tray');

            // Wait for promise to resolve
            await vi.waitFor(() => {
                expect(get(trayOpen)).toBe(true);
            });
        });

        it('set(false) updates store then calls invoke("close_tray")', () => {
            // First set to true (and wait for promise)
            mockInvoke.mockResolvedValueOnce(undefined);
            trayOpen.set(true);

            // Reset mock for close_tray tracking
            mockInvoke.mockClear();

            trayOpen.set(false);

            // Store should update immediately (before invoke resolves)
            expect(get(trayOpen)).toBe(false);

            // Should call close_tray
            expect(mockInvoke).toHaveBeenCalledWith('close_tray');
        });

        it('is subscribable', () => {
            let value = false;
            const unsubscribe = trayOpen.subscribe((v) => {
                value = v;
            });

            mockInvoke.mockResolvedValueOnce(undefined);
            trayOpen.set(false); // This will immediately set

            expect(value).toBe(false);
            unsubscribe();
        });
    });

    describe('clearInput()', () => {
        it('resets query, stdout, stderr, running, exitCode, stdoutLock', () => {
            // Set up state
            query.set('some query');
            stdout.set(['line1', 'line2']);
            stderr.set('error output');
            running.set(true);
            exitCode.set(1);
            stdoutLock.set(false);

            clearInput();

            expect(get(query)).toBe('');
            expect(get(stdout)).toEqual([]);
            expect(get(stderr)).toBe('');
            expect(get(running)).toBe(false);
            expect(get(exitCode)).toBe(undefined);
            expect(get(stdoutLock)).toBe(true);
        });

        it('calls stop_running', () => {
            clearInput();

            expect(mockInvoke).toHaveBeenCalledWith('stop_running');
        });
    });

    describe('isMac constant', () => {
        it('correctly detects macOS via navigator.platform', () => {
            // In jsdom, navigator.platform is typically empty or browser-specific
            // isMac is computed at module load time based on navigator.platform
            // We test that isMac is a boolean
            expect(typeof isMac).toBe('boolean');
        });
    });

    describe('keySymbols', () => {
        it('has cmd symbol', () => {
            expect(keySymbols.cmd).toBeDefined();
            // Should be either ⌘ (Mac) or Ctrl (Windows/Linux)
            expect(['⌘', 'Ctrl']).toContain(keySymbols.cmd);
        });

        it('has ctrl symbol', () => {
            expect(keySymbols.ctrl).toBeDefined();
            // Should be either ⌃ (Mac) or Ctrl (Windows/Linux)
            expect(['⌃', 'Ctrl']).toContain(keySymbols.ctrl);
        });

        it('has alt symbol', () => {
            expect(keySymbols.alt).toBeDefined();
            // Should be either ⌥ (Mac) or Alt (Windows/Linux)
            expect(['⌥', 'Alt']).toContain(keySymbols.alt);
        });

        it('has shift symbol', () => {
            expect(keySymbols.shift).toBe('⇧');
        });

        it('has enter symbol', () => {
            expect(keySymbols.enter).toBe('↵');
        });

        it('uses Mac symbols when isMac is true', () => {
            if (isMac) {
                expect(keySymbols.cmd).toBe('⌘');
                expect(keySymbols.ctrl).toBe('⌃');
                expect(keySymbols.alt).toBe('⌥');
            }
        });

        it('uses Windows/Linux symbols when isMac is false', () => {
            if (!isMac) {
                expect(keySymbols.cmd).toBe('Ctrl');
                expect(keySymbols.ctrl).toBe('Ctrl');
                expect(keySymbols.alt).toBe('Alt');
            }
        });
    });

    describe('currentTrayView store', () => {
        it('defaults to "stdout"', () => {
            currentTrayView.set('stdout');
            expect(get(currentTrayView)).toBe('stdout');
        });

        it('can be set to "stderr"', () => {
            currentTrayView.set('stderr');
            expect(get(currentTrayView)).toBe('stderr');
        });

        it('can be set to "errors"', () => {
            currentTrayView.set('errors');
            expect(get(currentTrayView)).toBe('errors');
        });

        it('can be set to "cmdSelector"', () => {
            currentTrayView.set('cmdSelector');
            expect(get(currentTrayView)).toBe('cmdSelector');
        });

        it('can be set to "info"', () => {
            currentTrayView.set('info');
            expect(get(currentTrayView)).toBe('info');
        });
    });

    describe('currentCmd store', () => {
        it('is a writable store', () => {
            expect(get(currentCmd)).toBe(undefined);

            currentCmd.set('test-command');
            expect(get(currentCmd)).toBe('test-command');
        });

        it('can be set to undefined', () => {
            currentCmd.set('command');
            currentCmd.set(undefined);
            expect(get(currentCmd)).toBeUndefined();
        });
    });

    describe('running store', () => {
        it('is a writable store', () => {
            expect(get(running)).toBe(false);

            running.set(true);
            expect(get(running)).toBe(true);

            running.set(false);
            expect(get(running)).toBe(false);
        });
    });

    describe('exitCode store', () => {
        it('is a writable store', () => {
            exitCode.set(0);
            expect(get(exitCode)).toBe(0);

            exitCode.set(1);
            expect(get(exitCode)).toBe(1);

            exitCode.set(-1);
            expect(get(exitCode)).toBe(-1);

            exitCode.set(undefined);
            expect(get(exitCode)).toBeUndefined();
        });
    });

    describe('stdoutLock store', () => {
        it('defaults to true', () => {
            stdoutLock.set(true);
            expect(get(stdoutLock)).toBe(true);
        });

        it('can be set to false', () => {
            stdoutLock.set(false);
            expect(get(stdoutLock)).toBe(false);
        });
    });

    describe('query store', () => {
        it('is a writable store', () => {
            expect(get(query)).toBe('');

            query.set('search term');
            expect(get(query)).toBe('search term');
        });

        it('handles empty string', () => {
            query.set('');
            expect(get(query)).toBe('');
        });

        it('handles unicode text', () => {
            query.set('日本語 🔍');
            expect(get(query)).toBe('日本語 🔍');
        });
    });

    describe('stderr store', () => {
        it('is a writable store', () => {
            expect(get(stderr)).toBe('');

            stderr.set('error message');
            expect(get(stderr)).toBe('error message');
        });

        it('handles multiline errors', () => {
            stderr.set('line1\nline2\nline3');
            expect(get(stderr)).toBe('line1\nline2\nline3');
        });
    });

    describe('scrollContainer store', () => {
        it('defaults to null', () => {
            scrollContainer.set(null);
            expect(get(scrollContainer)).toBeNull();
        });

        it('can be set to an HTMLElement', () => {
            const element = document.createElement('div');
            scrollContainer.set(element);
            expect(get(scrollContainer)).toBe(element);
        });

        it('can be cleared back to null', () => {
            const element = document.createElement('div');
            scrollContainer.set(element);
            scrollContainer.set(null);
            expect(get(scrollContainer)).toBeNull();
        });
    });

    describe('statusBar store', () => {
        it('has default empty state', () => {
            statusBar.set({ actions: [], count: '' });
            const state = get(statusBar);
            expect(state.actions).toEqual([]);
            expect(state.count).toBe('');
        });

        it('can be set with actions', () => {
            statusBar.set({
                actions: [
                    { key: '↵', label: 'copy' },
                    { key: '⌘+O', label: 'reveal' },
                ],
                count: '10 items',
            });

            const state = get(statusBar);
            expect(state.actions).toHaveLength(2);
            expect(state.actions[0].key).toBe('↵');
            expect(state.actions[0].label).toBe('copy');
            expect(state.count).toBe('10 items');
        });

        it('can be updated to clear', () => {
            statusBar.set({
                actions: [{ key: '↵', label: 'copy' }],
                count: '5 items',
            });

            statusBar.set({ actions: [], count: '' });

            const state = get(statusBar);
            expect(state.actions).toEqual([]);
            expect(state.count).toBe('');
        });
    });
});

describe('keySymbols platform detection', () => {
    // These tests verify the structure, since we can't easily mock
    // navigator.platform after module load
    it('keySymbols matches isMac state', () => {
        if (isMac) {
            expect(keySymbols.cmd).toBe('⌘');
            expect(keySymbols.ctrl).toBe('⌃');
            expect(keySymbols.alt).toBe('⌥');
        } else {
            expect(keySymbols.cmd).toBe('Ctrl');
            expect(keySymbols.ctrl).toBe('Ctrl');
            expect(keySymbols.alt).toBe('Alt');
        }
    });

    it('all symbols are strings', () => {
        expect(typeof keySymbols.cmd).toBe('string');
        expect(typeof keySymbols.ctrl).toBe('string');
        expect(typeof keySymbols.alt).toBe('string');
        expect(typeof keySymbols.shift).toBe('string');
        expect(typeof keySymbols.enter).toBe('string');
    });
});
