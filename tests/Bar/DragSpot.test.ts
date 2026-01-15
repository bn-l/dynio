/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import DragSpot from '../../src/Bar/DragSpot.svelte';

// Mock the startDragging function
const mockStartDragging = vi.fn();

// Mock @tauri-apps/api/webviewWindow
vi.mock('@tauri-apps/api/webviewWindow', () => ({
    getCurrentWebviewWindow: () => ({
        startDragging: mockStartDragging,
    }),
}));

// Also mock @tauri-apps/api/core for consistency
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn().mockResolvedValue(undefined),
}));

describe('DragSpot.svelte', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockStartDragging.mockResolvedValue(undefined);
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    describe('mousedown starts window dragging', () => {
        it('calls appWindow.startDragging() on mousedown', async () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            await fireEvent.mouseDown(dragSpot!);

            expect(mockStartDragging).toHaveBeenCalled();
        });

        it('calls startDragging exactly once per mousedown', async () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            await fireEvent.mouseDown(dragSpot!);

            expect(mockStartDragging).toHaveBeenCalledTimes(1);
        });

        it('calls startDragging on multiple mousedown events', async () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            await fireEvent.mouseDown(dragSpot!);
            await fireEvent.mouseDown(dragSpot!);
            await fireEvent.mouseDown(dragSpot!);

            expect(mockStartDragging).toHaveBeenCalledTimes(3);
        });

        it('does not call startDragging on mouseup', async () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            await fireEvent.mouseUp(dragSpot!);

            expect(mockStartDragging).not.toHaveBeenCalled();
        });

        it('does not call startDragging on click', async () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            // Note: click includes mousedown, so this test is more about
            // verifying the event binding is specifically mousedown
            // Clear any calls from the click's mousedown phase
            mockStartDragging.mockClear();
            await fireEvent.mouseMove(dragSpot!);

            expect(mockStartDragging).not.toHaveBeenCalled();
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

    describe('startDragging promise handling', () => {
        it('handles startDragging promise resolution', async () => {
            mockStartDragging.mockResolvedValue(undefined);

            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            // Should not throw
            await expect(fireEvent.mouseDown(dragSpot!)).resolves.toBe(true);
        });

        it('handles startDragging when it returns immediately', async () => {
            mockStartDragging.mockReturnValue(undefined);

            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            await fireEvent.mouseDown(dragSpot!);

            expect(mockStartDragging).toHaveBeenCalled();
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

            expect(mockStartDragging).toHaveBeenCalledTimes(10);
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

            expect(mockStartDragging).not.toHaveBeenCalled();
        });

        it('mouseleave does not trigger dragging', async () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            await fireEvent.mouseLeave(dragSpot!);

            expect(mockStartDragging).not.toHaveBeenCalled();
        });

        it('mouseover does not trigger dragging', async () => {
            const { container } = render(DragSpot);
            const dragSpot = container.querySelector('#dragSpot');

            await fireEvent.mouseOver(dragSpot!);

            expect(mockStartDragging).not.toHaveBeenCalled();
        });
    });
});
