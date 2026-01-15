/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import EmptyDisplay from '../../../src/Tray/Stdout/EmptyDisplay.svelte';

// Mock Tauri APIs (for consistency with other tests)
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn().mockResolvedValue(undefined),
}));

describe('EmptyDisplay.svelte', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    describe('message prop', () => {
        it('renders message when provided', () => {
            const { container } = render(EmptyDisplay, { props: { message: 'No output' } });

            expect(container.textContent).toContain('No output');
        });

        it('renders custom message text', () => {
            const { container } = render(EmptyDisplay, { props: { message: 'Loading...' } });

            expect(container.textContent).toContain('Loading...');
        });

        it('renders nothing when message is empty string', () => {
            const { container } = render(EmptyDisplay, { props: { message: '' } });

            const messageDiv = container.querySelector('#emptyDisplayMessage');
            expect(messageDiv).toBeTruthy();
            // The message div should be empty (no text content)
            expect(messageDiv?.textContent?.trim()).toBe('');
        });

        it('renders nothing when message prop not provided (default)', () => {
            const { container } = render(EmptyDisplay);

            const messageDiv = container.querySelector('#emptyDisplayMessage');
            expect(messageDiv).toBeTruthy();
            // Default message is empty string
            expect(messageDiv?.textContent?.trim()).toBe('');
        });

        it('handles message with special characters', () => {
            const { container } = render(EmptyDisplay, { props: { message: '<No & output>' } });

            expect(container.textContent).toContain('<No & output>');
        });

        it('handles unicode message', () => {
            const { container } = render(EmptyDisplay, { props: { message: '何もありません 🎉' } });

            expect(container.textContent).toContain('何もありません');
            expect(container.textContent).toContain('🎉');
        });
    });

    describe('showBackground prop', () => {
        it('accepts showBackground prop (default false)', () => {
            // Should not throw
            expect(() => render(EmptyDisplay)).not.toThrow();
        });

        it('accepts showBackground=true', () => {
            // Should not throw - prop is accepted even though unused in current implementation
            expect(() => render(EmptyDisplay, { props: { showBackground: true } })).not.toThrow();
        });

        it('accepts showBackground=false', () => {
            expect(() => render(EmptyDisplay, { props: { showBackground: false } })).not.toThrow();
        });

        it('renders same output regardless of showBackground (currently unused)', () => {
            // Test with showBackground=true
            const { container: container1 } = render(EmptyDisplay, {
                props: { message: 'Test', showBackground: true },
            });
            const text1 = container1.textContent;
            cleanup();

            // Test with showBackground=false
            const { container: container2 } = render(EmptyDisplay, {
                props: { message: 'Test', showBackground: false },
            });
            const text2 = container2.textContent;

            // Both should contain the message
            expect(text1).toContain('Test');
            expect(text2).toContain('Test');
        });
    });

    describe('layout and structure', () => {
        it('has #emptyDisplay as root element', () => {
            const { container } = render(EmptyDisplay);

            const root = container.querySelector('#emptyDisplay');
            expect(root).toBeTruthy();
        });

        it('has flex classes for centering', () => {
            const { container } = render(EmptyDisplay);

            const root = container.querySelector('#emptyDisplay');
            expect(root?.classList.contains('flex')).toBe(true);
            expect(root?.classList.contains('justify-center')).toBe(true);
            expect(root?.classList.contains('items-center')).toBe(true);
        });

        it('has full height and width classes', () => {
            const { container } = render(EmptyDisplay);

            const root = container.querySelector('#emptyDisplay');
            expect(root?.classList.contains('h-full')).toBe(true);
            expect(root?.classList.contains('w-full')).toBe(true);
        });

        it('has text-center class', () => {
            const { container } = render(EmptyDisplay);

            const root = container.querySelector('#emptyDisplay');
            expect(root?.classList.contains('text-center')).toBe(true);
        });

        it('has text-3xl class for font size', () => {
            const { container } = render(EmptyDisplay);

            const root = container.querySelector('#emptyDisplay');
            expect(root?.classList.contains('text-3xl')).toBe(true);
        });

        it('has #emptyDisplayMessage inner element', () => {
            const { container } = render(EmptyDisplay);

            const messageEl = container.querySelector('#emptyDisplayMessage');
            expect(messageEl).toBeTruthy();
        });
    });

    describe('conditional rendering', () => {
        it('shows message text when message is truthy', () => {
            const { container } = render(EmptyDisplay, { props: { message: 'Visible message' } });

            expect(container.textContent).toContain('Visible message');
        });

        it('shows empty when message is falsy (empty string)', () => {
            const { container } = render(EmptyDisplay, { props: { message: '' } });

            // Message div exists but is empty
            const messageDiv = container.querySelector('#emptyDisplayMessage');
            expect(messageDiv).toBeTruthy();
            expect(messageDiv?.textContent?.trim()).toBe('');
        });

        it('does not render image (currently commented out)', () => {
            const { container } = render(EmptyDisplay, { props: { message: '' } });

            // Image should not exist (commented out in source)
            const img = container.querySelector('img');
            expect(img).toBeNull();
        });
    });

    describe('edge cases', () => {
        it('handles very long message', () => {
            const longMessage = 'x'.repeat(1000);
            const { container } = render(EmptyDisplay, { props: { message: longMessage } });

            expect(container.textContent).toContain(longMessage);
        });

        it('handles multiline message', () => {
            const multilineMessage = 'Line 1\nLine 2\nLine 3';
            const { container } = render(EmptyDisplay, { props: { message: multilineMessage } });

            // Should contain the text (newlines become whitespace in HTML)
            expect(container.textContent).toContain('Line 1');
            expect(container.textContent).toContain('Line 2');
            expect(container.textContent).toContain('Line 3');
        });

        it('handles message with only whitespace', () => {
            const { container } = render(EmptyDisplay, { props: { message: '   ' } });

            // Whitespace-only message is still truthy, so it renders
            const messageDiv = container.querySelector('#emptyDisplayMessage');
            expect(messageDiv).toBeTruthy();
        });
    });

    describe('combined props', () => {
        it('accepts both message and showBackground', () => {
            expect(() =>
                render(EmptyDisplay, {
                    props: { message: 'Test', showBackground: true },
                })
            ).not.toThrow();
        });

        it('renders message with showBackground=true', () => {
            const { container } = render(EmptyDisplay, {
                props: { message: 'Combined test', showBackground: true },
            });

            expect(container.textContent).toContain('Combined test');
        });
    });
});
