/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { stderr } from '$lib/stores/globals';
import Stderr from '../../src/Tray/Stderr.svelte';

describe('Stderr.svelte', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        stderr.set('');

        // Mock console.log to reduce noise
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    describe('rendering stderr content', () => {
        it('renders stderr content as preformatted text', () => {
            stderr.set('This is stderr output');

            const { container } = render(Stderr);

            const preElement = container.querySelector('pre.stderr-content');
            expect(preElement).toBeTruthy();
            expect(preElement?.textContent).toBe('This is stderr output');
        });

        it('renders multi-line stderr content', () => {
            stderr.set('Line 1\nLine 2\nLine 3');

            const { container } = render(Stderr);

            const preElement = container.querySelector('pre.stderr-content');
            expect(preElement?.textContent).toBe('Line 1\nLine 2\nLine 3');
        });

        it('renders empty when stderr is empty', () => {
            stderr.set('');

            const { container } = render(Stderr);

            const preElement = container.querySelector('pre.stderr-content');
            expect(preElement?.textContent).toBe('');
        });

        it('updates when stderr store changes', async () => {
            const { container } = render(Stderr);

            // Initially empty
            const preElement = container.querySelector('pre.stderr-content');
            expect(preElement?.textContent).toBe('');

            // Update stderr
            stderr.set('New stderr content');

            await vi.waitFor(() => {
                expect(preElement?.textContent).toBe('New stderr content');
            });
        });
    });

    describe('clear button', () => {
        it('has "clear all" button', () => {
            const { container } = render(Stderr);

            const clearButton = container.querySelector('.errorClearButton');
            expect(clearButton).toBeTruthy();
            expect(clearButton?.textContent).toBe('clear all');
        });

        it('clicking "clear all" clears $stderr', async () => {
            stderr.set('Some stderr content to clear');

            const { container } = render(Stderr);

            const clearButton = container.querySelector('.errorClearButton');
            expect(clearButton).toBeTruthy();

            await fireEvent.click(clearButton!);

            expect(get(stderr)).toBe('');
        });

        it('clear button works with large stderr content', async () => {
            const largeContent = 'x\n'.repeat(1000);
            stderr.set(largeContent);

            const { container } = render(Stderr);

            const clearButton = container.querySelector('.errorClearButton');
            await fireEvent.click(clearButton!);

            expect(get(stderr)).toBe('');
        });
    });

    describe('whitespace preservation', () => {
        it('preserves leading whitespace', () => {
            stderr.set('    indented text');

            const { container } = render(Stderr);

            const preElement = container.querySelector('pre.stderr-content');
            expect(preElement?.textContent).toBe('    indented text');
        });

        it('preserves trailing whitespace', () => {
            stderr.set('text with trailing spaces    ');

            const { container } = render(Stderr);

            const preElement = container.querySelector('pre.stderr-content');
            expect(preElement?.textContent).toBe('text with trailing spaces    ');
        });

        it('preserves multiple consecutive spaces', () => {
            stderr.set('word     multiple     spaces');

            const { container } = render(Stderr);

            const preElement = container.querySelector('pre.stderr-content');
            expect(preElement?.textContent).toBe('word     multiple     spaces');
        });

        it('preserves tabs', () => {
            stderr.set('column1\tcolumn2\tcolumn3');

            const { container } = render(Stderr);

            const preElement = container.querySelector('pre.stderr-content');
            expect(preElement?.textContent).toBe('column1\tcolumn2\tcolumn3');
        });

        it('has pre-wrap style for word wrapping', () => {
            stderr.set('test');

            const { container } = render(Stderr);

            const preElement = container.querySelector('pre.stderr-content');
            // The style is defined in the component's <style> section
            // We can verify the class is applied
            expect(preElement?.classList.contains('stderr-content')).toBe(true);
        });
    });

    describe('panel structure', () => {
        it('has "Stderr" heading', () => {
            const { container } = render(Stderr);

            const heading = container.querySelector('#panelHeading');
            expect(heading?.textContent).toBe('Stderr');
        });

        it('uses ClearablePanel wrapper', () => {
            const { container } = render(Stderr);

            // ClearablePanel should render the heading and clear button
            expect(container.querySelector('#panelHeading')).toBeTruthy();
            expect(container.querySelector('.errorClearButton')).toBeTruthy();
        });
    });

    describe('edge cases', () => {
        it('handles very long single-line content', () => {
            const longLine = 'x'.repeat(10000);
            stderr.set(longLine);

            const { container } = render(Stderr);

            const preElement = container.querySelector('pre.stderr-content');
            expect(preElement?.textContent).toBe(longLine);
        });

        it('handles unicode content', () => {
            stderr.set('日本語エラー: ファイルが見つかりません 🚨');

            const { container } = render(Stderr);

            expect(container.textContent).toContain('日本語エラー');
            expect(container.textContent).toContain('🚨');
        });

        it('handles content with special HTML characters', () => {
            stderr.set('<error> tag & "quotes" are safe</error>');

            const { container } = render(Stderr);

            const preElement = container.querySelector('pre.stderr-content');
            expect(preElement?.textContent).toBe('<error> tag & "quotes" are safe</error>');
            // Should not create actual HTML elements
            expect(container.querySelector('error')).toBeNull();
        });

        it('handles ANSI escape codes (displayed as-is, not parsed)', () => {
            // Stderr doesn't parse ANSI - just displays raw
            stderr.set('\x1b[31mred text\x1b[0m');

            const { container } = render(Stderr);

            const preElement = container.querySelector('pre.stderr-content');
            // ANSI codes should be present in the text
            expect(preElement?.textContent).toContain('\x1b[31m');
        });

        it('handles carriage returns', () => {
            stderr.set('Progress: 50%\rProgress: 100%');

            const { container } = render(Stderr);

            const preElement = container.querySelector('pre.stderr-content');
            expect(preElement?.textContent).toBe('Progress: 50%\rProgress: 100%');
        });

        it('handles mixed newlines (CRLF)', () => {
            stderr.set('Line 1\r\nLine 2\r\nLine 3');

            const { container } = render(Stderr);

            const preElement = container.querySelector('pre.stderr-content');
            expect(preElement?.textContent).toBe('Line 1\r\nLine 2\r\nLine 3');
        });

        it('handles typical stack trace format', () => {
            const stackTrace = `Error: Something went wrong
    at function1 (/path/to/file.ts:10:5)
    at function2 (/path/to/file.ts:20:10)
    at function3 (/path/to/file.ts:30:15)`;

            stderr.set(stackTrace);

            const { container } = render(Stderr);

            const preElement = container.querySelector('pre.stderr-content');
            expect(preElement?.textContent).toBe(stackTrace);
        });
    });

    describe('reactivity', () => {
        it('updates display when stderr is appended to', async () => {
            stderr.set('Initial');

            const { container } = render(Stderr);

            const preElement = container.querySelector('pre.stderr-content');
            expect(preElement?.textContent).toBe('Initial');

            // Append more content
            const current = get(stderr);
            stderr.set(current + '\nAppended');

            await vi.waitFor(() => {
                expect(preElement?.textContent).toBe('Initial\nAppended');
            });
        });

        it('clears display when stderr is cleared externally', async () => {
            stderr.set('Content to be cleared');

            const { container } = render(Stderr);

            const preElement = container.querySelector('pre.stderr-content');
            expect(preElement?.textContent).toBe('Content to be cleared');

            // Clear externally
            stderr.set('');

            await vi.waitFor(() => {
                expect(preElement?.textContent).toBe('');
            });
        });
    });
});
