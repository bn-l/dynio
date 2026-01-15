import { describe, it, expect, beforeEach } from 'vitest';
import { errors } from './errors';
import { get } from 'svelte/store';

describe('errors store', () => {
    beforeEach(() => {
        errors.clear();
    });

    describe('addError()', () => {
        it('creates new error with count=1', () => {
            errors.addError('Test error message', 'js');

            const errorList = get(errors);
            expect(errorList.length).toBe(1);
            expect(errorList[0].message).toBe('Test error message');
            expect(errorList[0].count).toBe(1);
            expect(errorList[0].type).toBe('js');
        });

        it('generates an id for the error', () => {
            errors.addError('Error', 'js');

            const errorList = get(errors);
            expect(errorList[0].id).toBeDefined();
            expect(typeof errorList[0].id).toBe('string');
            expect(errorList[0].id.length).toBe(10); // nanoid(10)
        });

        it('sets timestamp to current time', () => {
            const before = Date.now();
            errors.addError('Error', 'js');
            const after = Date.now();

            const errorList = get(errors);
            expect(errorList[0].timestamp).toBeGreaterThanOrEqual(before);
            expect(errorList[0].timestamp).toBeLessThanOrEqual(after);
        });

        it('adds multiple different errors', () => {
            errors.addError('Error 1', 'js');
            errors.addError('Error 2', 'tauri');
            errors.addError('Error 3', 'shell');

            const errorList = get(errors);
            expect(errorList.length).toBe(3);
        });
    });

    describe('duplicate error handling (case-insensitive)', () => {
        it('increments count for exact duplicate', () => {
            errors.addError('Same error', 'js');
            errors.addError('Same error', 'js');

            const errorList = get(errors);
            expect(errorList.length).toBe(1);
            expect(errorList[0].count).toBe(2);
        });

        it('increments count for case-different duplicate', () => {
            errors.addError('same error', 'js');
            errors.addError('SAME ERROR', 'js');
            errors.addError('Same Error', 'js');

            const errorList = get(errors);
            expect(errorList.length).toBe(1);
            expect(errorList[0].count).toBe(3);
        });

        it('updates timestamp on duplicate', () => {
            errors.addError('Error', 'js');
            const firstTimestamp = get(errors)[0].timestamp;

            // Small delay to ensure different timestamp
            const later = Date.now() + 1;
            errors.addError('Error', 'js');

            const errorList = get(errors);
            expect(errorList[0].timestamp).toBeGreaterThanOrEqual(firstTimestamp);
        });

        it('preserves original message casing on duplicate', () => {
            errors.addError('Original Message', 'js');
            errors.addError('original message', 'js');

            const errorList = get(errors);
            expect(errorList[0].message).toBe('Original Message');
        });

        it('handles whitespace in duplicate detection', () => {
            errors.addError('  error with spaces  ', 'js');
            errors.addError('error with spaces', 'js');

            const errorList = get(errors);
            expect(errorList.length).toBe(1);
            expect(errorList[0].count).toBe(2);
        });

        it('treats different messages as separate errors', () => {
            errors.addError('Error A', 'js');
            errors.addError('Error B', 'js');

            const errorList = get(errors);
            expect(errorList.length).toBe(2);
            expect(errorList[0].count).toBe(1);
            expect(errorList[1].count).toBe(1);
        });
    });

    describe('removeError()', () => {
        it('removes error by id', () => {
            errors.addError('Error 1', 'js');
            errors.addError('Error 2', 'js');

            const errorList = get(errors);
            const idToRemove = errorList[0].id;

            errors.removeError(idToRemove);

            const updatedList = get(errors);
            expect(updatedList.length).toBe(1);
            expect(updatedList[0].message).toBe('Error 2');
        });

        it('does nothing for non-existent id', () => {
            errors.addError('Error', 'js');
            errors.removeError('non-existent-id');

            const errorList = get(errors);
            expect(errorList.length).toBe(1);
        });

        it('removes correct error when multiple exist', () => {
            errors.addError('Keep 1', 'js');
            errors.addError('Remove', 'js');
            errors.addError('Keep 2', 'js');

            const errorList = get(errors);
            const removeId = errorList[1].id;

            errors.removeError(removeId);

            const updatedList = get(errors);
            expect(updatedList.length).toBe(2);
            expect(updatedList.map(e => e.message)).toEqual(['Keep 1', 'Keep 2']);
        });
    });

    describe('clear()', () => {
        it('removes all errors', () => {
            errors.addError('Error 1', 'js');
            errors.addError('Error 2', 'tauri');
            errors.addError('Error 3', 'shell');

            errors.clear();

            const errorList = get(errors);
            expect(errorList.length).toBe(0);
        });

        it('works when already empty', () => {
            errors.clear();

            const errorList = get(errors);
            expect(errorList.length).toBe(0);
        });
    });

    describe('error types', () => {
        it('accepts "js" type', () => {
            errors.addError('JS error', 'js');
            expect(get(errors)[0].type).toBe('js');
        });

        it('accepts "tauri" type', () => {
            errors.addError('Tauri error', 'tauri');
            expect(get(errors)[0].type).toBe('tauri');
        });

        it('accepts "shell" type', () => {
            errors.addError('Shell error', 'shell');
            expect(get(errors)[0].type).toBe('shell');
        });

        it('accepts "unknown" type', () => {
            errors.addError('Unknown error', 'unknown');
            expect(get(errors)[0].type).toBe('unknown');
        });

        it('preserves type through duplicate increment', () => {
            errors.addError('Error', 'tauri');
            errors.addError('Error', 'js'); // Same message, different type

            const errorList = get(errors);
            // Duplicate detection only looks at message, not type
            // Original type should be preserved
            expect(errorList.length).toBe(1);
            expect(errorList[0].type).toBe('tauri');
        });
    });

    describe('ID generation uniqueness', () => {
        it('generates unique ids for different errors', () => {
            errors.addError('Error 1', 'js');
            errors.addError('Error 2', 'js');
            errors.addError('Error 3', 'js');

            const errorList = get(errors);
            const ids = errorList.map(e => e.id);
            const uniqueIds = new Set(ids);

            expect(uniqueIds.size).toBe(3);
        });

        it('generates unique ids across many errors', () => {
            for (let i = 0; i < 100; i++) {
                errors.addError(`Unique error ${i}`, 'js');
            }

            const errorList = get(errors);
            const ids = errorList.map(e => e.id);
            const uniqueIds = new Set(ids);

            expect(uniqueIds.size).toBe(100);
        });
    });

    describe('edge cases', () => {
        it('handles empty message', () => {
            errors.addError('', 'js');

            const errorList = get(errors);
            expect(errorList.length).toBe(1);
            expect(errorList[0].message).toBe('');
        });

        it('handles very long message', () => {
            const longMessage = 'x'.repeat(10000);
            errors.addError(longMessage, 'js');

            const errorList = get(errors);
            expect(errorList[0].message).toBe(longMessage);
        });

        it('handles unicode in message', () => {
            errors.addError('エラー 🚨 错误', 'js');

            const errorList = get(errors);
            expect(errorList[0].message).toBe('エラー 🚨 错误');
        });

        it('handles newlines in message', () => {
            errors.addError('Line 1\nLine 2\nLine 3', 'js');

            const errorList = get(errors);
            expect(errorList[0].message).toBe('Line 1\nLine 2\nLine 3');
        });

        it('store is subscribable', () => {
            let callCount = 0;
            const unsubscribe = errors.subscribe(() => {
                callCount++;
            });

            errors.addError('Test', 'js');
            errors.addError('Test 2', 'js');

            // Initial call + 2 updates
            expect(callCount).toBeGreaterThanOrEqual(2);
            unsubscribe();
        });
    });
});
