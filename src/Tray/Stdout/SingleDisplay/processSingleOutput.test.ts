import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processSingleOutput } from './processSingleOuput';
import { errors } from '$lib/stores/errors';
import { get } from 'svelte/store';

// Mock console.log to avoid noise
vi.spyOn(console, 'log').mockImplementation(() => {});

describe('processSingleOutput', () => {
    beforeEach(() => {
        errors.clear();
    });

    afterEach(() => {
        errors.clear();
    });

    describe('plain text passthrough', () => {
        it('returns joined text when displayOptions is undefined', () => {
            const result = processSingleOutput(['hello', 'world'], undefined);

            expect(result).toBe('hello\nworld');
        });

        it('returns joined text when displayOptions has no json/parseAnsi options', () => {
            const result = processSingleOutput(['line1', 'line2'], {});

            expect(result).toBe('line1\nline2');
        });

        it('handles single line', () => {
            const result = processSingleOutput(['single line'], undefined);

            expect(result).toBe('single line');
        });
    });

    describe('json=true without path', () => {
        it('pretty-prints valid JSON', () => {
            const input = '{"key":"value","nested":{"a":1}}';
            const result = processSingleOutput([input], { json: true });

            expect(result).toBe(JSON.stringify({ key: 'value', nested: { a: 1 } }, null, 2));
        });

        it('formats JSON array', () => {
            const input = '[1,2,3]';
            const result = processSingleOutput([input], { json: true });

            expect(result).toBe(JSON.stringify([1, 2, 3], null, 2));
        });

        it('handles JSON split across chunks', () => {
            const result = processSingleOutput(['{"a":', '"b"}'], { json: true });

            expect(result).toBe(JSON.stringify({ a: 'b' }, null, 2));
        });
    });

    describe('json=true with jsonPath', () => {
        it('extracts nested value', () => {
            const input = '{"data":{"items":{"first":"found"}}}';
            const result = processSingleOutput([input], { json: true, jsonPath: 'data.items.first' });

            expect(result).toBe('found');
        });

        it('extracts from array using index notation', () => {
            const input = '{"choices":[{"message":{"content":"extracted"}}]}';
            const result = processSingleOutput([input], { json: true, jsonPath: 'choices.0.message.content' });

            expect(result).toBe('extracted');
        });

        it('extracts array when path ends at array', () => {
            const input = '{"items":[1,2,3]}';
            const result = processSingleOutput([input], { json: true, jsonPath: 'items' });

            expect(result).toEqual([1, 2, 3]);
        });

        it('extracts first-level value', () => {
            const input = '{"topLevel":"value"}';
            const result = processSingleOutput([input], { json: true, jsonPath: 'topLevel' });

            expect(result).toBe('value');
        });

        it('extracts deeply nested value', () => {
            const input = '{"a":{"b":{"c":{"d":{"e":"deep"}}}}}';
            const result = processSingleOutput([input], { json: true, jsonPath: 'a.b.c.d.e' });

            expect(result).toBe('deep');
        });
    });

    describe('invalid JSON with json=true', () => {
        it('adds error to store and returns original string', () => {
            const input = 'not valid json';
            const result = processSingleOutput([input], { json: true });

            expect(result).toBe('not valid json');
            const errorList = get(errors);
            expect(errorList.length).toBe(1);
            expect(errorList[0].type).toBe('js');
        });

        it('adds error for malformed JSON', () => {
            const input = '{"unclosed": "brace"';
            processSingleOutput([input], { json: true });

            const errorList = get(errors);
            expect(errorList.length).toBe(1);
            expect(errorList[0].message).toContain('Unexpected end');
        });
    });

    describe('jsonPath that does not exist', () => {
        it('returns undefined for non-existent path', () => {
            const input = '{"existing":"value"}';
            const result = processSingleOutput([input], { json: true, jsonPath: 'nonexistent.path' });

            expect(result).toBeUndefined();
        });

        it('returns undefined when path starts valid but goes invalid', () => {
            const input = '{"a":{"b":"value"}}';
            const result = processSingleOutput([input], { json: true, jsonPath: 'a.c.d' });

            expect(result).toBeUndefined();
        });
    });

    describe('parseAnsiColors=true', () => {
        it('converts ANSI to HTML', () => {
            const input = '\x1b[31mred text\x1b[0m';
            const result = processSingleOutput([input], { parseAnsiColors: true });

            expect(result).toContain('<span');
            expect(result).toContain('red text');
            expect(result).not.toContain('\x1b');
        });

        it('converts ANSI after JSON processing', () => {
            const input = '{"msg":"\\u001b[32mgreen\\u001b[0m"}';
            const result = processSingleOutput([input], { json: true, jsonPath: 'msg', parseAnsiColors: true });

            // JSON parse would convert \u001b to actual escape char, then ANSI converts
            expect(result).toContain('green');
        });

        it('handles plain text with no ANSI', () => {
            const result = processSingleOutput(['plain text'], { parseAnsiColors: true });

            expect(result).toBe('plain text');
        });
    });

    describe('empty stdout', () => {
        it('returns empty string for empty array', () => {
            const result = processSingleOutput([], undefined);

            expect(result).toBe('');
        });

        it('returns empty string with options', () => {
            const result = processSingleOutput([], { json: true });

            // Empty string is not valid JSON, so error will be added
            const errorList = get(errors);
            expect(errorList.length).toBe(1);
        });
    });

    describe('very large JSON output', () => {
        it('handles large nested JSON', () => {
            const largeObj: Record<string, unknown> = {};
            for (let i = 0; i < 1000; i++) {
                largeObj[`key${i}`] = { nested: { value: i } };
            }
            const input = JSON.stringify(largeObj);
            const result = processSingleOutput([input], { json: true });

            const parsed = JSON.parse(result as string);
            expect(Object.keys(parsed).length).toBe(1000);
        });

        it('extracts from large JSON with path', () => {
            const largeObj: Record<string, unknown> = {};
            for (let i = 0; i < 1000; i++) {
                largeObj[`key${i}`] = { nested: { value: i } };
            }
            const input = JSON.stringify(largeObj);
            const result = processSingleOutput([input], { json: true, jsonPath: 'key500.nested.value' });

            expect(result).toBe(500);
        });
    });

    describe('json=false with JSON-like content', () => {
        it('does not parse when json is false', () => {
            const input = '{"key":"value"}';
            const result = processSingleOutput([input], { json: false });

            // Should return as-is, not pretty-printed
            expect(result).toBe('{"key":"value"}');
        });

        it('does not parse when json is undefined', () => {
            const input = '{"key":"value"}';
            const result = processSingleOutput([input], {});

            expect(result).toBe('{"key":"value"}');
        });
    });

    describe('edge cases', () => {
        it('handles JSON with unicode', () => {
            const input = '{"text":"日本語 🎉"}';
            const result = processSingleOutput([input], { json: true, jsonPath: 'text' });

            expect(result).toBe('日本語 🎉');
        });

        it('handles JSON with special characters', () => {
            const input = '{"text":"line1\\nline2\\ttab"}';
            const result = processSingleOutput([input], { json: true, jsonPath: 'text' });

            expect(result).toBe('line1\nline2\ttab');
        });

        it('handles null value in JSON path', () => {
            const input = '{"value":null}';
            const result = processSingleOutput([input], { json: true, jsonPath: 'value' });

            expect(result).toBeNull();
        });

        it('handles number value in JSON path', () => {
            const input = '{"num":42}';
            const result = processSingleOutput([input], { json: true, jsonPath: 'num' });

            expect(result).toBe(42);
        });

        it('handles boolean value in JSON path', () => {
            const input = '{"flag":true}';
            const result = processSingleOutput([input], { json: true, jsonPath: 'flag' });

            expect(result).toBe(true);
        });
    });
});
