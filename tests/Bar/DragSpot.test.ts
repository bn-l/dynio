/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import DragSpot from '../../src/Bar/DragSpot.svelte';

// Mock the native startDragging function. In jsdom we cannot observe the OS
// drag, so these tests assert the timing contract that caused the regression:
// the drag must begin during mousedown, without waiting for IPC.
const mockStartDragging = vi.fn();
const mockInvoke = vi.fn();

// Mock @tauri-apps/api/webviewWindow
vi.mock('@tauri-apps/api/webviewWindow', () => ({
    getCurrentWebviewWindow: () => ({
        startDragging: mockStartDragging,
    }),
}));

// Also mock @tauri-apps/api/core for consistency
vi.mock('@tauri-apps/api/core', () => ({
    invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe('DragSpot.svelte', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockStartDragging.mockResolvedValue(undefined);
        mockInvoke.mockResolvedValue(undefined);
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    describe('mousedown starts window dragging', () => {
        it('starts the native drag during the mousedown handler', async () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            await fireEvent.mouseDown(dragSpot!);

            expect(mockInvoke).toHaveBeenCalledWith('begin_window_drag');
            expect(mockStartDragging).toHaveBeenCalledTimes(1);
        });

        it('does not wait for backend bookkeeping before starting the native drag', async () => {
            let resolveInvoke: (() => void) | undefined;
            const pendingInvoke = new Promise<void>((resolve) => {
                resolveInvoke = resolve;
            });
            mockInvoke.mockReturnValueOnce(pendingInvoke);

            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            await fireEvent.mouseDown(dragSpot!);

            expect(mockInvoke).toHaveBeenCalledWith('begin_window_drag');
            expect(mockStartDragging).toHaveBeenCalledTimes(1);

            resolveInvoke?.();
        });

        it('uses one backend command per mousedown instead of a mousemove IPC loop', async () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            await fireEvent.mouseDown(dragSpot!);
            window.dispatchEvent(new MouseEvent('mousemove'));

            expect(mockInvoke).toHaveBeenCalledTimes(1);
            expect(mockInvoke).not.toHaveBeenCalledWith('update_window_drag');
        });

        it('starts native dragging on multiple mousedown events', async () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            await fireEvent.mouseDown(dragSpot!);
            await fireEvent.mouseDown(dragSpot!);
            await fireEvent.mouseDown(dragSpot!);

            expect(mockStartDragging).toHaveBeenCalledTimes(3);
        });

        it('does not start dragging on mouseup', async () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            await fireEvent.mouseUp(dragSpot!);

            expect(mockInvoke).not.toHaveBeenCalled();
        });

        it('does not start dragging on mousemove', async () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            await fireEvent.mouseMove(dragSpot!);

            expect(mockInvoke).not.toHaveBeenCalled();
        });

        it('does not start dragging for non-primary mouse buttons', async () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            await fireEvent.mouseDown(dragSpot!, { button: 2 });

            expect(mockInvoke).not.toHaveBeenCalled();
        });
    });

    describe('manual drag lifecycle', () => {
        it('starts the drag once for one mousedown even if backend bookkeeping is pending', async () => {
            let resolveInvoke: (() => void) | undefined;
            const pendingInvoke = new Promise<void>((resolve) => {
                resolveInvoke = resolve;
            });
            mockInvoke.mockReturnValueOnce(pendingInvoke);

            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            await fireEvent.mouseDown(dragSpot!);

            expect(mockStartDragging).toHaveBeenCalledTimes(1);

            resolveInvoke?.();
        });

        it('does not send backend update commands on window mousemove', async () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            await fireEvent.mouseDown(dragSpot!);
            window.dispatchEvent(new MouseEvent('mousemove'));

            expect(mockInvoke).not.toHaveBeenCalledWith('update_window_drag');
        });

        it('finishes the drag on mouseup without sending mousemove updates', async () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            await fireEvent.mouseDown(dragSpot!);
            window.dispatchEvent(new MouseEvent('mousemove'));
            window.dispatchEvent(new MouseEvent('mouseup'));
            window.dispatchEvent(new MouseEvent('mousemove'));

            expect(mockInvoke.mock.calls.map((call) => call[0])).toEqual([
                'begin_window_drag',
                'finish_window_drag',
            ]);
        });

        it('finishes the drag when the window blurs', async () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            await fireEvent.mouseDown(dragSpot!);
            window.dispatchEvent(new Event('blur'));

            expect(mockInvoke.mock.calls.map((call) => call[0])).toEqual([
                'begin_window_drag',
                'finish_window_drag',
            ]);
        });
    });

    describe('positioning', () => {
        it('has absolute positioning class', () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            expect(dragSpot?.classList.contains('absolute')).toBe(true);
        });

        it('is positioned on right edge (right-0)', () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            expect(dragSpot?.classList.contains('right-0')).toBe(true);
        });

        it('has top offset (top-3)', () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            expect(dragSpot?.classList.contains('top-3')).toBe(true);
        });

        it('has bottom offset (bottom-3)', () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            expect(dragSpot?.classList.contains('bottom-3')).toBe(true);
        });

        it('has narrow width (w-[2%])', () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            expect(dragSpot?.classList.contains('w-[2%]')).toBe(true);
        });
    });

    describe('element structure', () => {
        it('has #dragSpot as element id', () => {
            const { container } = render(DragSpot);

            const dragSpot = container.querySelector('#dragSpot');
            expect(dragSpot).toBeTruthy();
        });

        it('is a div element', () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            expect(dragSpot?.tagName.toLowerCase()).toBe('div');
        });

        it('has rounded corners (rounded-md)', () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            expect(dragSpot?.classList.contains('rounded-md')).toBe(true);
        });
    });

    describe('cursor styling', () => {
        it('has cursor-grab class for visual feedback', () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            expect(dragSpot?.classList.contains('cursor-grab')).toBe(true);
        });
    });

    describe('drag command promise handling', () => {
        it('handles drag command promise resolution', async () => {
            mockInvoke.mockResolvedValue(undefined);

            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            // Should not throw
            await expect(fireEvent.mouseDown(dragSpot!)).resolves.toBe(true);
        });

        it('handles drag command when it returns immediately', async () => {
            mockInvoke.mockReturnValue(undefined);

            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            await fireEvent.mouseDown(dragSpot!);

            expect(mockInvoke).toHaveBeenCalledWith('begin_window_drag');
            expect(mockStartDragging).toHaveBeenCalledTimes(1);
        });
    });

    describe('edge cases', () => {
        it('handles rapid mousedown events', async () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            // Rapid mousedown events
            for (let i = 0; i < 10; i++) {
                await fireEvent.mouseDown(dragSpot!);
            }

            expect(mockInvoke).toHaveBeenCalledTimes(10);
        });

        it('renders without errors', () => {
            expect(() => render(DragSpot)).not.toThrow();
        });

        it('has no text content (visual-only element)', () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            expect(dragSpot?.textContent?.trim()).toBe('');
        });
    });

    describe('interaction with other mouse events', () => {
        it('mouseenter does not trigger dragging', async () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            await fireEvent.mouseEnter(dragSpot!);

            expect(mockInvoke).not.toHaveBeenCalled();
        });

        it('mouseleave does not trigger dragging', async () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            await fireEvent.mouseLeave(dragSpot!);

            expect(mockInvoke).not.toHaveBeenCalled();
        });

        it('mouseover does not trigger dragging', async () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            await fireEvent.mouseOver(dragSpot!);

            expect(mockInvoke).not.toHaveBeenCalled();
        });
    });
});
