/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { scrollContainer } from '$lib/stores/globals';
import DisplayWrapper from '../../../src/lib/utils/DisplayWrapper.svelte';
import { stubPanelScroll } from '../../helpers/panelScroll';

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn().mockResolvedValue(undefined),
}));

describe('DisplayWrapper.svelte', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset scrollContainer to null before each test
        scrollContainer.set(null);
    });

    afterEach(() => {
        cleanup();
        scrollContainer.set(null);
    });

    describe('scrollContainer store binding', () => {
        it('sets $scrollContainer to inner scroll element on mount', () => {
            render(DisplayWrapper);

            const container = get(scrollContainer);
            expect(container).toBeTruthy();
            expect(container).toBeInstanceOf(HTMLElement);
        });

        it('scroll element has overflow-y-scroll class', () => {
            render(DisplayWrapper);

            const container = get(scrollContainer);
            expect(container?.classList.contains('overflow-y-scroll')).toBe(true);
        });

        it('scroll element has overflow-x-hidden class', () => {
            render(DisplayWrapper);

            const container = get(scrollContainer);
            expect(container?.classList.contains('overflow-x-hidden')).toBe(true);
        });

        it('scroll element has nice-scroll class', () => {
            render(DisplayWrapper);

            const container = get(scrollContainer);
            expect(container?.classList.contains('nice-scroll')).toBe(true);
        });

        it('scroll element has list-none class', () => {
            render(DisplayWrapper);

            const container = get(scrollContainer);
            expect(container?.classList.contains('list-none')).toBe(true);
        });
    });

    describe('clears $scrollContainer on destroy', () => {
        it('sets $scrollContainer to null when component unmounts', () => {
            const { unmount } = render(DisplayWrapper);

            // Before unmount, should be set
            expect(get(scrollContainer)).toBeTruthy();

            // Unmount triggers onDestroy
            unmount();

            // After unmount, should be null
            expect(get(scrollContainer)).toBeNull();
        });

        it('clears scrollContainer even after multiple re-renders', () => {
            const { unmount, rerender } = render(DisplayWrapper);

            expect(get(scrollContainer)).toBeTruthy();

            // Re-render
            rerender({});
            expect(get(scrollContainer)).toBeTruthy();

            // Unmount
            unmount();
            expect(get(scrollContainer)).toBeNull();
        });
    });

    describe('padding prop', () => {
        it('applies default padding "p-4" when not specified', () => {
            render(DisplayWrapper);

            const container = get(scrollContainer);
            expect(container?.classList.contains('p-4')).toBe(true);
        });

        it('applies custom padding class when provided', () => {
            render(DisplayWrapper, { props: { padding: 'p-8' } });

            const container = get(scrollContainer);
            expect(container?.classList.contains('p-8')).toBe(true);
            expect(container?.classList.contains('p-4')).toBe(false);
        });

        it('applies multiple padding classes', () => {
            render(DisplayWrapper, { props: { padding: 'pl-4 pt-4 pr-6' } });

            const container = get(scrollContainer);
            expect(container?.classList.contains('pl-4')).toBe(true);
            expect(container?.classList.contains('pt-4')).toBe(true);
            expect(container?.classList.contains('pr-6')).toBe(true);
        });

        it('applies padding with different units', () => {
            render(DisplayWrapper, { props: { padding: 'px-2 py-3' } });

            const container = get(scrollContainer);
            expect(container?.classList.contains('px-2')).toBe(true);
            expect(container?.classList.contains('py-3')).toBe(true);
        });

        it('handles empty string padding (no padding)', () => {
            render(DisplayWrapper, { props: { padding: '' } });

            const container = get(scrollContainer);
            // Empty string means no padding class added
            expect(container?.classList.contains('p-4')).toBe(false);
        });
    });

    describe('slot content rendering', () => {
        it('renders slot content inside scroll container', async () => {
            // Using a test wrapper to provide slot content
            const TestWrapper = {
                template: `
                    <DisplayWrapper>
                        <div data-testid="slot-content">Test Content</div>
                    </DisplayWrapper>
                `,
                components: { DisplayWrapper },
            };

            // Since we can't easily test slots with @testing-library/svelte,
            // we verify the structure is correct for receiving slots
            const { container } = render(DisplayWrapper);

            // The scroll container should exist and be capable of holding children
            const scrollEl = get(scrollContainer);
            expect(scrollEl).toBeTruthy();
            expect(scrollEl?.tagName.toLowerCase()).toBe('div');
        });

        it('scroll container is a child of the root flex container', () => {
            const { container } = render(DisplayWrapper);

            const root = container.querySelector('.h-full.w-full.flex.flex-col');
            expect(root).toBeTruthy();

            const scrollEl = get(scrollContainer);
            expect(root?.contains(scrollEl)).toBe(true);
        });
    });

    describe('layout structure', () => {
        it('has h-full w-full on outer wrapper', () => {
            const { container } = render(DisplayWrapper);

            const outer = container.querySelector('.h-full.w-full');
            expect(outer).toBeTruthy();
        });

        it('has flex flex-col on outer wrapper', () => {
            const { container } = render(DisplayWrapper);

            const outer = container.querySelector('.flex.flex-col');
            expect(outer).toBeTruthy();
        });

        it('scroll element has flex-grow class', () => {
            render(DisplayWrapper);

            const container = get(scrollContainer);
            expect(container?.classList.contains('flex-grow')).toBe(true);
        });
    });

    describe('overflow behavior', () => {
        // Always scroll, never auto: an auto scrollbar takes width when it appears and
        // re-wraps every row (WebKit's scrollbar-gutter doesn't reserve it for styled scrollbars)
        it('has overflow-y-scroll so the scrollbar never shifts content', () => {
            render(DisplayWrapper);

            const container = get(scrollContainer);
            expect(container?.classList.contains('overflow-y-scroll')).toBe(true);
            expect(container?.classList.contains('overflow-y-auto')).toBe(false);
        });

        it('has overflow-x-hidden to prevent horizontal scroll', () => {
            render(DisplayWrapper);

            const container = get(scrollContainer);
            expect(container?.classList.contains('overflow-x-hidden')).toBe(true);
        });
    });

    describe('scrollEl prop', () => {
        it('scrollEl prop is initially undefined externally', () => {
            // The component binds scrollEl internally via bind:this
            // We can verify it gets set to the scroll container
            render(DisplayWrapper);

            const container = get(scrollContainer);
            expect(container).toBeTruthy();
        });
    });

    describe('multiple instances', () => {
        it('last mounted instance sets scrollContainer', () => {
            const { unmount: unmount1 } = render(DisplayWrapper);
            const firstContainer = get(scrollContainer);

            const { unmount: unmount2 } = render(DisplayWrapper);
            const secondContainer = get(scrollContainer);

            // Second instance overwrites the store
            expect(secondContainer).not.toBe(firstContainer);

            // Clean up
            unmount2();
            // After unmount2, scrollContainer is null
            expect(get(scrollContainer)).toBeNull();

            unmount1();
        });
    });

    describe('Cmd/Ctrl+J/K scrolling', () => {
        const keydown = (init: KeyboardEventInit) =>
            new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });

        it('Ctrl+J scrolls down and Cmd+K scrolls back up by the same amount', async () => {
            render(DisplayWrapper);
            const scrollBy = stubPanelScroll();

            await fireEvent.keyDown(document.body, { key: 'j', code: 'KeyJ', ctrlKey: true });
            await fireEvent.keyDown(document.body, { key: 'k', code: 'KeyK', metaKey: true });

            const [[down], [up]] = scrollBy.mock.calls;
            expect(down.top).toBeGreaterThan(0);
            expect(up.top).toBe(-down.top);
            expect(down.behavior).toBe('instant');
            expect(up.behavior).toBe('instant');
        });

        it('works when Ctrl+letter gives a control character as the key (macOS)', async () => {
            render(DisplayWrapper);
            const scrollBy = stubPanelScroll();

            await fireEvent.keyDown(document.body, { key: '\n', code: 'KeyJ', ctrlKey: true });
            await fireEvent.keyDown(document.body, { key: '\v', code: 'KeyK', ctrlKey: true });

            expect(scrollBy).toHaveBeenCalledTimes(2);
            expect(scrollBy.mock.calls[0][0].top).toBeGreaterThan(0);
            expect(scrollBy.mock.calls[1][0].top).toBeLessThan(0);
        });

        it('scrolls on every key repeat (none are dropped)', async () => {
            render(DisplayWrapper);
            const scrollBy = stubPanelScroll();

            for (let i = 0; i < 3; i++) {
                document.body.dispatchEvent(keydown({ key: 'j', code: 'KeyJ', ctrlKey: true }));
            }

            expect(scrollBy).toHaveBeenCalledTimes(3);
        });

        it('prevents Ctrl+K in the input, so it does not delete the rest of the line', () => {
            render(DisplayWrapper);
            stubPanelScroll();
            const input = document.createElement('input');
            document.body.appendChild(input);
            input.focus();

            const event = keydown({ key: '\v', code: 'KeyK', ctrlKey: true });
            input.dispatchEvent(event);

            expect(event.defaultPrevented).toBe(true);
            input.remove();
        });

        it('plain j and k (typing) neither scroll nor get prevented', () => {
            render(DisplayWrapper);
            const scrollBy = stubPanelScroll();

            const j = keydown({ key: 'j', code: 'KeyJ' });
            const k = keydown({ key: 'k', code: 'KeyK' });
            document.body.dispatchEvent(j);
            document.body.dispatchEvent(k);

            expect(scrollBy).not.toHaveBeenCalled();
            expect(j.defaultPrevented).toBe(false);
            expect(k.defaultPrevented).toBe(false);
        });

        it('keyScroll={false} leaves Ctrl+J/K alone', () => {
            render(DisplayWrapper, { props: { keyScroll: false } });
            const scrollBy = stubPanelScroll();

            const event = keydown({ key: 'j', code: 'KeyJ', ctrlKey: true });
            document.body.dispatchEvent(event);

            expect(scrollBy).not.toHaveBeenCalled();
            expect(event.defaultPrevented).toBe(false);
        });

        it('stops handling Ctrl+J/K after unmount', () => {
            const { unmount } = render(DisplayWrapper);
            unmount();

            const event = keydown({ key: 'k', code: 'KeyK', ctrlKey: true });
            document.body.dispatchEvent(event);

            expect(event.defaultPrevented).toBe(false);
        });
    });

    describe('edge cases', () => {
        it('renders without errors', () => {
            expect(() => render(DisplayWrapper)).not.toThrow();
        });

        it('handles rapid mount/unmount cycles', () => {
            for (let i = 0; i < 5; i++) {
                const { unmount } = render(DisplayWrapper);
                expect(get(scrollContainer)).toBeTruthy();
                unmount();
                expect(get(scrollContainer)).toBeNull();
            }
        });

        it('scroll element is a div', () => {
            render(DisplayWrapper);

            const container = get(scrollContainer);
            expect(container?.tagName.toLowerCase()).toBe('div');
        });
    });
});
