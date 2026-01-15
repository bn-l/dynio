/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { errors } from '$lib/stores/errors';
import ErrorList from '../../src/Tray/ErrorList.svelte';

describe('ErrorList.svelte', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        errors.clear();

        // Mock console.log to reduce noise
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    describe('rendering errors', () => {
        it('renders errors with count, message, type, timestamp', () => {
            // Set a fixed timestamp for testing
            const now = new Date('2025-01-15T14:30:45').getTime();
            vi.spyOn(Date, 'now').mockReturnValue(now);

            errors.addError('Test error message', 'js');

            const { container } = render(ErrorList);

            // Check count
            expect(container.textContent).toContain('1');
            // Check message
            expect(container.textContent).toContain('Test error message');
            // Check type
            expect(container.textContent).toContain('js');
            // Check timestamp (HH:MM:SS)
            expect(container.textContent).toContain('14:30:45');
        });

        it('renders multiple errors in order', () => {
            errors.addError('First error', 'js');
            errors.addError('Second error', 'tauri');
            errors.addError('Third error', 'shell');

            const { container } = render(ErrorList);

            expect(container.textContent).toContain('First error');
            expect(container.textContent).toContain('Second error');
            expect(container.textContent).toContain('Third error');

            // Check types are present
            expect(container.textContent).toContain('js');
            expect(container.textContent).toContain('tauri');
            expect(container.textContent).toContain('shell');
        });

        it('shows error count for duplicate errors', () => {
            // Add same error 3 times
            errors.addError('Duplicate error', 'js');
            errors.addError('Duplicate error', 'js');
            errors.addError('Duplicate error', 'js');

            const { container } = render(ErrorList);

            // Should show count of 3
            expect(container.textContent).toContain('3');
            // Should only have one "Duplicate error" entry (deduplicated)
            const errorList = get(errors);
            expect(errorList.length).toBe(1);
            expect(errorList[0].count).toBe(3);
        });

        it('renders empty list when no errors', () => {
            const { container } = render(ErrorList);

            // Should still render the panel structure
            expect(container.textContent).toContain('Errors');
            expect(container.textContent).toContain('clear all');
        });
    });

    describe('timestamp formatting', () => {
        it('formats timestamp as HH:MM:SS with zero-padding', () => {
            // Set time to 09:05:07
            const timestamp = new Date('2025-01-15T09:05:07').getTime();
            vi.spyOn(Date, 'now').mockReturnValue(timestamp);

            errors.addError('Test', 'js');

            const { container } = render(ErrorList);

            expect(container.textContent).toContain('09:05:07');
        });

        it('formats midnight correctly as 00:00:00', () => {
            const timestamp = new Date('2025-01-15T00:00:00').getTime();
            vi.spyOn(Date, 'now').mockReturnValue(timestamp);

            errors.addError('Midnight error', 'js');

            const { container } = render(ErrorList);

            expect(container.textContent).toContain('00:00:00');
        });

        it('formats end of day correctly as 23:59:59', () => {
            const timestamp = new Date('2025-01-15T23:59:59').getTime();
            vi.spyOn(Date, 'now').mockReturnValue(timestamp);

            errors.addError('End of day error', 'js');

            const { container } = render(ErrorList);

            expect(container.textContent).toContain('23:59:59');
        });
    });

    describe('click "del" removes individual error', () => {
        it('removes error when clicking del', async () => {
            errors.addError('Error to remove', 'js');
            errors.addError('Error to keep', 'tauri');

            const { container } = render(ErrorList);

            // Find the first del button (associated with first error)
            const delButtons = container.querySelectorAll('code');
            const firstDelButton = Array.from(delButtons).find(
                (el) => el.textContent === 'del'
            );

            expect(firstDelButton).toBeTruthy();

            // Get parent div that has the click handler
            const clickableDiv = firstDelButton?.closest('.col-span-2');
            expect(clickableDiv).toBeTruthy();

            await fireEvent.click(clickableDiv!);

            // Wait for store update
            await vi.waitFor(() => {
                const errorList = get(errors);
                expect(errorList.length).toBe(1);
                expect(errorList[0].message).toBe('Error to keep');
            });
        });

        it('removes correct error from multiple', async () => {
            errors.addError('Error A', 'js');
            errors.addError('Error B', 'tauri');
            errors.addError('Error C', 'shell');

            const { container } = render(ErrorList);

            // Get all clickable del containers
            const delContainers = container.querySelectorAll('.col-span-2');
            // Filter to get only those containing "del"
            const delClickables = Array.from(delContainers).filter(
                (el) => el.textContent?.includes('del')
            );

            expect(delClickables.length).toBe(3);

            // Click the second one (Error B)
            await fireEvent.click(delClickables[1]);

            await vi.waitFor(() => {
                const errorList = get(errors);
                expect(errorList.length).toBe(2);
                expect(errorList.some((e) => e.message === 'Error B')).toBe(false);
                expect(errorList.some((e) => e.message === 'Error A')).toBe(true);
                expect(errorList.some((e) => e.message === 'Error C')).toBe(true);
            });
        });
    });

    describe('clear all via ClearablePanel', () => {
        it('clears all errors when clicking "clear all"', async () => {
            errors.addError('Error 1', 'js');
            errors.addError('Error 2', 'tauri');
            errors.addError('Error 3', 'shell');

            const { container } = render(ErrorList);

            const clearButton = container.querySelector('.errorClearButton');
            expect(clearButton).toBeTruthy();
            expect(clearButton?.textContent).toBe('clear all');

            await fireEvent.click(clearButton!);

            await vi.waitFor(() => {
                const errorList = get(errors);
                expect(errorList.length).toBe(0);
            });
        });

        it('clear all works even with many errors', async () => {
            // Add 20 errors
            for (let i = 0; i < 20; i++) {
                errors.addError(`Error ${i}`, 'js');
            }

            const { container } = render(ErrorList);

            const clearButton = container.querySelector('.errorClearButton');
            await fireEvent.click(clearButton!);

            await vi.waitFor(() => {
                expect(get(errors).length).toBe(0);
            });
        });
    });

    describe('error types', () => {
        it('displays "js" error type', () => {
            errors.addError('JS error', 'js');

            const { container } = render(ErrorList);

            expect(container.textContent).toContain('js');
        });

        it('displays "tauri" error type', () => {
            errors.addError('Tauri error', 'tauri');

            const { container } = render(ErrorList);

            expect(container.textContent).toContain('tauri');
        });

        it('displays "shell" error type', () => {
            errors.addError('Shell error', 'shell');

            const { container } = render(ErrorList);

            expect(container.textContent).toContain('shell');
        });

        it('displays "unknown" error type', () => {
            errors.addError('Unknown error', 'unknown');

            const { container } = render(ErrorList);

            expect(container.textContent).toContain('unknown');
        });
    });

    describe('panel structure', () => {
        it('has "Errors" heading', () => {
            const { container } = render(ErrorList);

            const heading = container.querySelector('#panelHeading');
            expect(heading?.textContent).toBe('Errors');
        });

        it('uses grid layout with correct columns', () => {
            errors.addError('Test', 'js');

            const { container } = render(ErrorList);

            const grid = container.querySelector('.grid');
            expect(grid).toBeTruthy();
            expect(grid?.classList.contains('grid-cols-20')).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('handles very long error messages', () => {
            const longMessage = 'x'.repeat(1000);
            errors.addError(longMessage, 'js');

            const { container } = render(ErrorList);

            expect(container.textContent).toContain(longMessage);
        });

        it('handles error messages with special characters', () => {
            errors.addError('<script>alert("xss")</script>', 'js');

            const { container } = render(ErrorList);

            // Should display as text, not execute
            expect(container.textContent).toContain('<script>');
            expect(container.querySelector('script')).toBeNull();
        });

        it('handles unicode error messages', () => {
            errors.addError('日本語エラー 🚨', 'js');

            const { container } = render(ErrorList);

            expect(container.textContent).toContain('日本語エラー 🚨');
        });

        it('handles rapid error additions', async () => {
            const { container } = render(ErrorList);

            // Rapidly add errors
            for (let i = 0; i < 10; i++) {
                errors.addError(`Rapid error ${i}`, 'js');
            }

            await vi.waitFor(() => {
                expect(container.textContent).toContain('Rapid error 9');
            });
        });
    });
});
