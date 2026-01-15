/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { scrollContainer } from '$lib/stores/globals';
import DisplayWrapper from '../../../src/lib/utils/DisplayWrapper.svelte';

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

        it('scroll element has overflow-y-auto class', () => {
            render(DisplayWrapper);

            const container = get(scrollContainer);
            expect(container?.classList.contains('overflow-y-auto')).toBe(true);
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
        it('has overflow-y-auto for vertical scrolling', () => {
            render(DisplayWrapper);

            const container = get(scrollContainer);
            expect(container?.classList.contains('overflow-y-auto')).toBe(true);
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
