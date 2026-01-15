/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import {
    trayOpen,
    stdout,
    stderr,
    running,
    stdoutLock,
    query,
    currentTrayView,
    currentCmd,
    scrollContainer,
    statusBar,
} from '$lib/stores/globals';
import { cmdConfig } from '$lib/stores/cmd-config';
import { settings } from '$lib/stores/settings';
import { errors } from '$lib/stores/errors';
import type { CmdConfigItem } from '$lib/stores/schema/cmd-config-schema';

// Mock Tauri APIs
const mockInvoke = vi.fn();
const mockOpenUrl = vi.fn();
const mockGetCurrentWindow = vi.fn();
const mockOnFocusChanged = vi.fn();
const mockStartDragging = vi.fn();

// Store event handlers registered via listen()
type EventHandler<T> = (event: { payload: T }) => void;
const eventHandlers: Record<string, EventHandler<unknown>> = {};

const mockListen = vi.fn((eventName: string, handler: EventHandler<unknown>) => {
    eventHandlers[eventName] = handler;
    return Promise.resolve(() => {
        delete eventHandlers[eventName];
    });
});

vi.mock('@tauri-apps/api/event', () => ({
    listen: (eventName: string, handler: EventHandler<unknown>) => mockListen(eventName, handler),
}));

vi.mock('@tauri-apps/api/core', () => ({
    invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
    openUrl: (...args: unknown[]) => mockOpenUrl(...args),
}));

vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: () => mockGetCurrentWindow(),
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
    getCurrentWebviewWindow: () => ({
        startDragging: mockStartDragging,
    }),
}));

// Mock Svelte transitions to avoid getComputedStyle issues in jsdom
vi.mock('svelte/transition', () => ({
    blur: () => ({ duration: 0 }),
    fade: () => ({ duration: 0 }),
    fly: () => ({ duration: 0 }),
    slide: () => ({ duration: 0 }),
    scale: () => ({ duration: 0 }),
    draw: () => ({ duration: 0 }),
    crossfade: () => [() => ({ duration: 0 }), () => ({ duration: 0 })],
}));

// Mock config loading
vi.mock('./lib/utils/config-file-utils.ts', () => ({
    loadValidateAndInitConfigStores: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocking
import App from './App.svelte';

// Helper to emit Tauri events
function emitEvent<T>(eventName: string, payload: T) {
    const handler = eventHandlers[eventName];
    if (handler) {
        handler({ payload });
    }
}

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

describe('App.svelte', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        mockInvoke.mockResolvedValue(undefined);
        mockOpenUrl.mockResolvedValue(undefined);
        mockGetCurrentWindow.mockReturnValue({
            onFocusChanged: mockOnFocusChanged.mockResolvedValue(() => {}),
        });

        // Reset stores
        trayOpen.set(false);
        stdout.set([]);
        stderr.set('');
        running.set(false);
        stdoutLock.set(true);
        query.set('');
        currentTrayView.set('stdout');
        currentCmd.set('test-cmd');
        scrollContainer.set(null);
        statusBar.set({ actions: [], count: '' });
        cmdConfig.set({
            'test-cmd': createConfig(),
        });
        settings.set({});
        errors.clear();

        // Clear event handlers
        Object.keys(eventHandlers).forEach((key) => delete eventHandlers[key]);

        // Mock console.log
        vi.spyOn(console, 'log').mockImplementation(() => {});

        // Mock scrollIntoView - jsdom doesn't support it
        // We need to use Object.defineProperty to properly polyfill it
        if (!window.HTMLElement.prototype.scrollIntoView) {
            window.HTMLElement.prototype.scrollIntoView = vi.fn();
        }
        if (!window.Element.prototype.scrollIntoView) {
            window.Element.prototype.scrollIntoView = vi.fn();
        }
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    describe('stdout event handling', () => {
        it('opens tray on stdout event', async () => {
            render(App);
            await vi.runAllTimersAsync();

            trayOpen.set(false);
            stdoutLock.set(false);
            emitEvent('stdout', ['line 1', 'line 2']);

            // trayOpen store uses async invoke before setting, need to flush
            await vi.runAllTimersAsync();

            expect(get(trayOpen)).toBe(true);
        });

        it('updates $stdout with payload', async () => {
            render(App);
            await vi.runAllTimersAsync();

            stdoutLock.set(false);
            emitEvent('stdout', ['line 1', 'line 2']);

            expect(get(stdout)).toEqual(['line 1', 'line 2']);
        });

        it('reverses payload when reverse=true', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'list',
                        displayOptions: { reverse: true },
                        activationOptions: {},
                    },
                }),
            });

            render(App);
            await vi.runAllTimersAsync();

            stdoutLock.set(false);
            emitEvent('stdout', ['a', 'b', 'c']);

            expect(get(stdout)).toEqual(['c', 'b', 'a']);
        });

        it('ignores stdout when $stdoutLock=true', async () => {
            render(App);
            await vi.runAllTimersAsync();

            stdoutLock.set(true);
            stdout.set(['existing']);
            emitEvent('stdout', ['new']);

            expect(get(stdout)).toEqual(['existing']);
        });

        it('increments emptyStdCounter on empty payload', async () => {
            render(App);
            await vi.runAllTimersAsync();

            stdoutLock.set(false);
            stdout.set(['existing']);

            // First empty - sets timeout
            emitEvent('stdout', []);
            expect(get(stdout)).toEqual(['existing']); // Not cleared yet

            // Advance timeout
            await vi.advanceTimersByTimeAsync(800);
            expect(get(stdout)).toEqual([]);
        });

        it('clears stdout immediately after 3+ empty payloads', async () => {
            render(App);
            await vi.runAllTimersAsync();

            stdoutLock.set(false);
            stdout.set(['existing']);

            // Send 4 empties (counter > 3)
            emitEvent('stdout', []);
            emitEvent('stdout', []);
            emitEvent('stdout', []);
            emitEvent('stdout', []);

            expect(get(stdout)).toEqual([]);
        });

        it('uses noOutputTimeoutMs from config', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    noOutputTimeoutMs: 200,
                }),
            });

            render(App);
            await vi.runAllTimersAsync();

            stdoutLock.set(false);
            stdout.set(['existing']);
            emitEvent('stdout', []);

            // Not yet cleared at 199ms
            await vi.advanceTimersByTimeAsync(199);
            expect(get(stdout)).toEqual(['existing']);

            // Cleared at 200ms
            await vi.advanceTimersByTimeAsync(1);
            expect(get(stdout)).toEqual([]);
        });

        it('resets emptyStdCounter on non-empty payload', async () => {
            render(App);
            await vi.runAllTimersAsync();

            stdoutLock.set(false);
            stdout.set(['existing']);

            // Send 2 empties
            emitEvent('stdout', []);
            emitEvent('stdout', []);

            // Then non-empty - should reset counter
            emitEvent('stdout', ['new']);
            expect(get(stdout)).toEqual(['new']);

            // 3 more empties needed to clear immediately
            emitEvent('stdout', []);
            emitEvent('stdout', []);
            emitEvent('stdout', []);
            // Still not cleared immediately (only 3, need > 3)
            expect(get(stdout)).toEqual(['new']);
        });
    });

    describe('stderr event handling', () => {
        it('updates $stderr with content', async () => {
            render(App);
            await vi.runAllTimersAsync();

            emitEvent('stderr', ['error line 1', 'error line 2']);

            expect(get(stderr)).toBe('error line 1\nerror line 2');
        });

        it('opens tray when stderr has content', async () => {
            render(App);
            await vi.runAllTimersAsync();

            trayOpen.set(false);
            emitEvent('stderr', ['error']);

            // trayOpen store uses async invoke before setting, need to flush
            await vi.runAllTimersAsync();

            expect(get(trayOpen)).toBe(true);
        });

        it('does not open tray when stderr is empty', async () => {
            render(App);
            await vi.runAllTimersAsync();

            trayOpen.set(false);
            emitEvent('stderr', ['']);

            expect(get(trayOpen)).toBe(false);
        });

        it('filters stderr with stderrFilterRegex', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'list',
                        displayOptions: { stderrFilterRegex: '^DEBUG:' },
                        activationOptions: {},
                    },
                }),
            });

            render(App);
            await vi.runAllTimersAsync();

            emitEvent('stderr', ['DEBUG: ignored', 'ERROR: kept', 'DEBUG: also ignored']);

            expect(get(stderr)).toBe('ERROR: kept');
        });

        it('does not open tray if all stderr filtered out', async () => {
            cmdConfig.set({
                'test-cmd': createConfig({
                    modeConfig: {
                        mode: 'list',
                        displayOptions: { stderrFilterRegex: '.*' },
                        activationOptions: {},
                    },
                }),
            });

            render(App);
            await vi.runAllTimersAsync();

            trayOpen.set(false);
            emitEvent('stderr', ['everything filtered']);

            expect(get(trayOpen)).toBe(false);
        });
    });

    describe('exit event handling', () => {
        it('sets $running=false (debounced 100ms)', async () => {
            render(App);
            await vi.runAllTimersAsync();

            running.set(true);
            emitEvent('exit', 0);

            // Not yet - debounced
            expect(get(running)).toBe(true);

            await vi.advanceTimersByTimeAsync(100);
            expect(get(running)).toBe(false);
        });

        it('debounces multiple exit events', async () => {
            render(App);
            await vi.runAllTimersAsync();

            running.set(true);

            emitEvent('exit', 0);
            await vi.advanceTimersByTimeAsync(50);
            emitEvent('exit', 1);
            await vi.advanceTimersByTimeAsync(50);

            // Still running - debounce restarted
            expect(get(running)).toBe(true);

            await vi.advanceTimersByTimeAsync(50);
            expect(get(running)).toBe(false);
        });
    });

    describe('main_hide_unhide event handling', () => {
        it('hide: resets currentTrayView to stdout', async () => {
            render(App);
            await vi.runAllTimersAsync();

            currentTrayView.set('errors');
            emitEvent('main_hide_unhide', 'hide');

            expect(get(currentTrayView)).toBe('stdout');
        });

        it('hide: closes tray if empty', async () => {
            render(App);
            await vi.runAllTimersAsync();

            trayOpen.set(true);
            query.set('');
            stdout.set([]);
            stderr.set('');
            errors.clear();

            emitEvent('main_hide_unhide', 'hide');

            expect(get(trayOpen)).toBe(false);
        });

        it('hide: keeps tray open if query present', async () => {
            render(App);
            await vi.runAllTimersAsync();

            trayOpen.set(true);
            await vi.runAllTimersAsync(); // Wait for async trayOpen store
            query.set('search term');
            stdout.set([]);
            stderr.set('');
            errors.clear();

            emitEvent('main_hide_unhide', 'hide');

            expect(get(trayOpen)).toBe(true);
        });

        it('hide: keeps tray open if stdout present', async () => {
            render(App);
            await vi.runAllTimersAsync();

            trayOpen.set(true);
            await vi.runAllTimersAsync(); // Wait for async trayOpen store
            query.set('');
            stdout.set(['output']);
            stderr.set('');
            errors.clear();

            emitEvent('main_hide_unhide', 'hide');

            expect(get(trayOpen)).toBe(true);
        });

        it('hide: keeps tray open if stderr present', async () => {
            render(App);
            await vi.runAllTimersAsync();

            trayOpen.set(true);
            await vi.runAllTimersAsync(); // Wait for async trayOpen store
            query.set('');
            stdout.set([]);
            stderr.set('error');
            errors.clear();

            emitEvent('main_hide_unhide', 'hide');

            expect(get(trayOpen)).toBe(true);
        });

        it('hide: keeps tray open if errors present', async () => {
            render(App);
            await vi.runAllTimersAsync();

            trayOpen.set(true);
            await vi.runAllTimersAsync(); // Wait for async trayOpen store
            query.set('');
            stdout.set([]);
            stderr.set('');
            errors.addError('error', 'js');

            emitEvent('main_hide_unhide', 'hide');

            expect(get(trayOpen)).toBe(true);
        });

        it('hide: schedules input clear (10 min timeout)', async () => {
            render(App);
            await vi.runAllTimersAsync();

            query.set('search term');
            emitEvent('main_hide_unhide', 'hide');

            // Query not cleared immediately
            expect(get(query)).toBe('search term');

            // After 10 minutes
            await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
            expect(get(query)).toBe('');
        });

        it('unhide: cancels clear timeout', async () => {
            render(App);
            await vi.runAllTimersAsync();

            query.set('search term');
            emitEvent('main_hide_unhide', 'hide');

            // 5 minutes pass
            await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

            // Unhide cancels the timeout
            emitEvent('main_hide_unhide', 'unhide');

            // Even after 10 more minutes, query not cleared
            await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
            expect(get(query)).toBe('search term');
        });

        it('unhide: focuses input', async () => {
            render(App);
            await vi.runAllTimersAsync();

            const mockFocus = vi.fn();
            const originalGetElementById = document.getElementById.bind(document);
            vi.spyOn(document, 'getElementById').mockImplementation((id) => {
                if (id === 'cmdInput') {
                    return { focus: mockFocus, scrollIntoView: vi.fn() } as unknown as HTMLElement;
                }
                return originalGetElementById(id);
            });

            emitEvent('main_hide_unhide', 'unhide');

            expect(mockFocus).toHaveBeenCalled();
        });
    });

    describe('escape key handling', () => {
        it('switches to stdout when currentTrayView !== stdout', async () => {
            const { container } = render(App);
            await vi.runAllTimersAsync();

            currentTrayView.set('errors');

            await fireEvent.keyDown(document.body, { key: 'Escape' });

            expect(get(currentTrayView)).toBe('stdout');
        });

        it('clears input when query.length > 0', async () => {
            render(App);
            await vi.runAllTimersAsync();

            currentTrayView.set('stdout');
            query.set('search term');

            await fireEvent.keyDown(document.body, { key: 'Escape' });
            await vi.runAllTimersAsync(); // For tick()

            expect(get(query)).toBe('');
        });

        it('hides main window when already empty', async () => {
            render(App);
            await vi.runAllTimersAsync();

            currentTrayView.set('stdout');
            query.set('');

            await fireEvent.keyDown(document.body, { key: 'Escape' });

            expect(mockInvoke).toHaveBeenCalledWith('hide_main');
        });
    });

    describe('Cmd/Ctrl+number hotkeys', () => {
        // Note: In jsdom, navigator.platform is not "Mac", so isMac is false
        // Therefore the modifier is Control, not Meta

        it('switches to command by hotkey number', async () => {
            cmdConfig.set({
                'cmd-one': createConfig({ hotkeyNumber: 1 }),
                'cmd-two': createConfig({ hotkeyNumber: 2 }),
            });
            currentCmd.set('cmd-one');

            render(App);
            await vi.runAllTimersAsync();

            await fireEvent.keyDown(document.body, {
                key: '2',
                ctrlKey: true,
            });

            expect(get(currentCmd)).toBe('cmd-two');
        });

        it('clears input on command switch', async () => {
            cmdConfig.set({
                'cmd-one': createConfig({ hotkeyNumber: 1 }),
                'cmd-two': createConfig({ hotkeyNumber: 2 }),
            });
            currentCmd.set('cmd-one');
            query.set('search');

            render(App);
            await vi.runAllTimersAsync();

            await fireEvent.keyDown(document.body, {
                key: '2',
                ctrlKey: true,
            });

            expect(get(query)).toBe('');
        });

        it('sets currentTrayView to stdout on command switch', async () => {
            cmdConfig.set({
                'cmd-one': createConfig({ hotkeyNumber: 1 }),
                'cmd-two': createConfig({ hotkeyNumber: 2 }),
            });
            currentCmd.set('cmd-one');
            currentTrayView.set('errors');

            render(App);
            await vi.runAllTimersAsync();

            await fireEvent.keyDown(document.body, {
                key: '2',
                ctrlKey: true,
            });

            expect(get(currentTrayView)).toBe('stdout');
        });

        it('does nothing when no matching hotkey', async () => {
            cmdConfig.set({
                'cmd-one': createConfig({ hotkeyNumber: 1 }),
            });
            currentCmd.set('cmd-one');

            render(App);
            await vi.runAllTimersAsync();

            await fireEvent.keyDown(document.body, {
                key: '5',
                ctrlKey: true,
            });

            expect(get(currentCmd)).toBe('cmd-one');
        });
    });

    describe('Cmd/Ctrl+S toggle', () => {
        // Note: In jsdom, navigator.platform is not "Mac", so isMac is false
        // Therefore the modifier is Control, not Meta

        it('opens cmdSelector from stdout view', async () => {
            render(App);
            await vi.runAllTimersAsync();

            currentTrayView.set('stdout');

            await fireEvent.keyDown(document.body, {
                key: 'S',
                ctrlKey: true,
            });

            // trayOpen store uses async invoke
            await vi.runAllTimersAsync();

            expect(get(currentTrayView)).toBe('cmdSelector');
            expect(get(trayOpen)).toBe(true);
        });

        it('switches back to stdout when already in cmdSelector', async () => {
            render(App);
            await vi.runAllTimersAsync();

            currentTrayView.set('cmdSelector');

            await fireEvent.keyDown(document.body, {
                key: 'S',
                ctrlKey: true,
            });

            expect(get(currentTrayView)).toBe('stdout');
        });

        it('clears input when opening cmdSelector', async () => {
            render(App);
            await vi.runAllTimersAsync();

            currentTrayView.set('stdout');
            query.set('search');

            await fireEvent.keyDown(document.body, {
                key: 'S',
                ctrlKey: true,
            });

            expect(get(query)).toBe('');
        });
    });

    describe('Ctrl+U/D half-page scroll', () => {
        it('Ctrl+U scrolls up half page when tray open', async () => {
            const mockScrollBy = vi.fn();
            const mockContainer = {
                clientHeight: 400,
                scrollBy: mockScrollBy,
            };
            scrollContainer.set(mockContainer as unknown as HTMLElement);
            trayOpen.set(true);

            render(App);
            await vi.runAllTimersAsync();

            await fireEvent.keyDown(window, {
                code: 'KeyU',
                ctrlKey: true,
            });

            expect(mockScrollBy).toHaveBeenCalledWith({
                top: -200, // half of 400
                behavior: 'smooth',
            });
        });

        it('Ctrl+D scrolls down half page when tray open', async () => {
            const mockScrollBy = vi.fn();
            const mockContainer = {
                clientHeight: 400,
                scrollBy: mockScrollBy,
            };
            scrollContainer.set(mockContainer as unknown as HTMLElement);
            trayOpen.set(true);

            render(App);
            await vi.runAllTimersAsync();

            await fireEvent.keyDown(window, {
                code: 'KeyD',
                ctrlKey: true,
            });

            expect(mockScrollBy).toHaveBeenCalledWith({
                top: 200, // half of 400
                behavior: 'smooth',
            });
        });

        it('Ctrl+U/D does nothing when tray closed', async () => {
            const mockScrollBy = vi.fn();
            const mockContainer = {
                clientHeight: 400,
                scrollBy: mockScrollBy,
            };
            scrollContainer.set(mockContainer as unknown as HTMLElement);
            trayOpen.set(false);

            render(App);
            await vi.runAllTimersAsync();

            await fireEvent.keyDown(window, {
                code: 'KeyU',
                ctrlKey: true,
            });

            expect(mockScrollBy).not.toHaveBeenCalled();
        });

        it('Ctrl+U/D does nothing when no scrollContainer', async () => {
            scrollContainer.set(null);
            trayOpen.set(true);

            render(App);
            await vi.runAllTimersAsync();

            // Should not throw
            await fireEvent.keyDown(window, {
                code: 'KeyU',
                ctrlKey: true,
            });
        });
    });

    describe('error tracking', () => {
        it('opens tray when new errors arrive', async () => {
            render(App);
            await vi.runAllTimersAsync();

            trayOpen.set(false);
            errors.addError('new error', 'js');

            // Reactive statement needs to run
            await vi.runAllTimersAsync();

            expect(get(trayOpen)).toBe(true);
        });

        it('tracks prevErrorsLen correctly', async () => {
            render(App);
            await vi.runAllTimersAsync();

            trayOpen.set(false);

            // First error opens tray
            errors.addError('error 1', 'js');
            await vi.runAllTimersAsync();
            expect(get(trayOpen)).toBe(true);

            // Close tray manually
            trayOpen.set(false);

            // Second error opens tray again
            errors.addError('error 2', 'tauri');
            await vi.runAllTimersAsync();
            expect(get(trayOpen)).toBe(true);
        });
    });

    describe('focus loss handling', () => {
        it('hides window when hideOnLostFocus=true', async () => {
            settings.set({ hideOnLostFocus: true });

            let focusHandler: ((event: { payload: boolean }) => void) | undefined;
            mockOnFocusChanged.mockImplementation((handler) => {
                focusHandler = handler;
                return Promise.resolve(() => {});
            });

            render(App);
            await vi.runAllTimersAsync();

            // Simulate focus loss
            if (focusHandler) {
                focusHandler({ payload: false });
            }

            expect(mockInvoke).toHaveBeenCalledWith('hide_main');
        });

        it('does not hide window when hideOnLostFocus=false', async () => {
            settings.set({ hideOnLostFocus: false });

            let focusHandler: ((event: { payload: boolean }) => void) | undefined;
            mockOnFocusChanged.mockImplementation((handler) => {
                focusHandler = handler;
                return Promise.resolve(() => {});
            });

            render(App);
            await vi.runAllTimersAsync();

            mockInvoke.mockClear();

            // Simulate focus loss
            if (focusHandler) {
                focusHandler({ payload: false });
            }

            expect(mockInvoke).not.toHaveBeenCalledWith('hide_main');
        });

        it('uses default hideOnLostFocus=true when undefined', async () => {
            settings.set({}); // No hideOnLostFocus set

            let focusHandler: ((event: { payload: boolean }) => void) | undefined;
            mockOnFocusChanged.mockImplementation((handler) => {
                focusHandler = handler;
                return Promise.resolve(() => {});
            });

            render(App);
            await vi.runAllTimersAsync();

            // Simulate focus loss
            if (focusHandler) {
                focusHandler({ payload: false });
            }

            expect(mockInvoke).toHaveBeenCalledWith('hide_main');
        });
    });

    describe('external link handling', () => {
        it('opens http links in external browser', async () => {
            const { container } = render(App);
            await vi.runAllTimersAsync();

            // Create and add a link to the document
            const link = document.createElement('a');
            link.href = 'https://example.com';
            link.textContent = 'External Link';
            container.appendChild(link);

            await fireEvent.click(link);

            expect(mockOpenUrl).toHaveBeenCalledWith('https://example.com');
        });

        it('opens https links in external browser', async () => {
            const { container } = render(App);
            await vi.runAllTimersAsync();

            const link = document.createElement('a');
            link.href = 'http://example.com';
            link.textContent = 'HTTP Link';
            container.appendChild(link);

            await fireEvent.click(link);

            expect(mockOpenUrl).toHaveBeenCalledWith('http://example.com');
        });

        it('ignores non-http links', async () => {
            const { container } = render(App);
            await vi.runAllTimersAsync();

            const link = document.createElement('a');
            link.href = 'file:///local/file';
            link.textContent = 'File Link';
            container.appendChild(link);

            await fireEvent.click(link);

            expect(mockOpenUrl).not.toHaveBeenCalled();
        });

        it('ignores clicks on non-link elements', async () => {
            const { container } = render(App);
            await vi.runAllTimersAsync();

            const div = document.createElement('div');
            div.textContent = 'Not a link';
            container.appendChild(div);

            await fireEvent.click(div);

            expect(mockOpenUrl).not.toHaveBeenCalled();
        });
    });

    describe('status bar updates', () => {
        it('shows "esc go back" when viewing stderr', async () => {
            render(App);
            await vi.runAllTimersAsync();

            currentTrayView.set('stderr');
            await vi.runAllTimersAsync();

            const status = get(statusBar);
            expect(status.actions).toContainEqual({ key: 'esc', label: 'go back' });
        });

        it('shows "esc go back" when viewing errors', async () => {
            render(App);
            await vi.runAllTimersAsync();

            currentTrayView.set('errors');
            await vi.runAllTimersAsync();

            const status = get(statusBar);
            expect(status.actions).toContainEqual({ key: 'esc', label: 'go back' });
        });

        it('shows "esc to clear" when query present and stdout empty', async () => {
            render(App);
            await vi.runAllTimersAsync();

            currentTrayView.set('stdout');
            stdout.set([]);
            query.set('search term');
            await vi.runAllTimersAsync();

            const status = get(statusBar);
            expect(status.actions).toContainEqual({ key: 'esc', label: 'to clear' });
        });

        it('shows "esc to hide" when query empty and stdout empty', async () => {
            render(App);
            await vi.runAllTimersAsync();

            currentTrayView.set('stdout');
            stdout.set([]);
            query.set('');
            await vi.runAllTimersAsync();

            const status = get(statusBar);
            expect(status.actions).toContainEqual({ key: 'esc', label: 'to hide' });
        });
    });

    describe('prevented keys', () => {
        it('prevents Alt+Escape', async () => {
            render(App);
            await vi.runAllTimersAsync();

            const event = new KeyboardEvent('keydown', {
                key: 'Escape',
                altKey: true,
                bubbles: true,
                cancelable: true,
            });
            const prevented = !window.dispatchEvent(event);

            expect(prevented).toBe(true);
        });

        it('prevents Alt+Space', async () => {
            render(App);
            await vi.runAllTimersAsync();

            const event = new KeyboardEvent('keydown', {
                key: ' ',
                altKey: true,
                bubbles: true,
                cancelable: true,
            });
            const prevented = !window.dispatchEvent(event);

            expect(prevented).toBe(true);
        });

        it('prevents F5', async () => {
            render(App);
            await vi.runAllTimersAsync();

            const event = new KeyboardEvent('keydown', {
                key: 'F5',
                bubbles: true,
                cancelable: true,
            });
            const prevented = !window.dispatchEvent(event);

            expect(prevented).toBe(true);
        });

        it('prevents Cmd/Ctrl+R', async () => {
            render(App);
            await vi.runAllTimersAsync();

            const event = new KeyboardEvent('keydown', {
                code: 'KeyR',
                metaKey: true,
                bubbles: true,
                cancelable: true,
            });
            const prevented = !window.dispatchEvent(event);

            expect(prevented).toBe(true);
        });
    });

    describe('command change reactive statement', () => {
        it('focuses input on command change', async () => {
            render(App);
            await vi.runAllTimersAsync();

            const mockFocus = vi.fn();
            const originalGetElementById = document.getElementById.bind(document);
            vi.spyOn(document, 'getElementById').mockImplementation((id) => {
                if (id === 'cmdInput') {
                    return { focus: mockFocus, scrollIntoView: vi.fn() } as unknown as HTMLElement;
                }
                return originalGetElementById(id);
            });

            currentCmd.set('new-cmd');
            await vi.runAllTimersAsync();

            expect(mockFocus).toHaveBeenCalled();
        });
    });

    describe('event listener cleanup', () => {
        it('cleans up stdout listener on unmount', async () => {
            const { unmount } = render(App);
            await vi.runAllTimersAsync();

            expect(eventHandlers['stdout']).toBeDefined();

            unmount();
            await vi.runAllTimersAsync();

            expect(eventHandlers['stdout']).toBeUndefined();
        });

        it('cleans up stderr listener on unmount', async () => {
            const { unmount } = render(App);
            await vi.runAllTimersAsync();

            expect(eventHandlers['stderr']).toBeDefined();

            unmount();
            await vi.runAllTimersAsync();

            expect(eventHandlers['stderr']).toBeUndefined();
        });

        it('cleans up exit listener on unmount', async () => {
            const { unmount } = render(App);
            await vi.runAllTimersAsync();

            expect(eventHandlers['exit']).toBeDefined();

            unmount();
            await vi.runAllTimersAsync();

            expect(eventHandlers['exit']).toBeUndefined();
        });

        it('cleans up main_hide_unhide listener on unmount', async () => {
            const { unmount } = render(App);
            await vi.runAllTimersAsync();

            expect(eventHandlers['main_hide_unhide']).toBeDefined();

            unmount();
            await vi.runAllTimersAsync();

            expect(eventHandlers['main_hide_unhide']).toBeUndefined();
        });
    });
});
