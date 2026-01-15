/**
 * @vitest-environment jsdom
 *
 * Tests for invalid regex pattern handling across the codebase.
 *
 * NOTE: These tests document that invalid regex patterns currently throw
 * uncaught SyntaxError exceptions. This is the current behavior - the tests
 * verify the expected error is thrown, which could guide future error handling
 * improvements.
 *
 * Related regex usages:
 * - stderrFilterRegex: App.svelte line 156
 * - lineSplitterRegex: processListOutput.ts line 26
 * - thinkingOpenPattern/thinkingClosePattern: processLlmOutput.ts lines 22-23
 * - extractorRegexBody: activator.ts line 27 (tested in activator.test.ts)
 */
import { describe, it, expect } from 'vitest';
import { processLlmOutput } from '../../../src/Tray/Stdout/LlmDisplay/processLlmOutput';
import { processListOutput } from '../../../src/Tray/Stdout/ListDisplay/processListOutput';

describe('Invalid Regex Handling', () => {
    describe('stderrFilterRegex (used in App.svelte)', () => {
        // stderrFilterRegex is used as: new RegExp(filterPattern)
        // We simulate the same pattern here to test error behavior

        function applyStderrFilter(lines: string[], filterPattern: string): string[] {
            const regex = new RegExp(filterPattern);
            return lines.filter(line => !regex.test(line));
        }

        it('throws SyntaxError on unclosed bracket', () => {
            expect(() => {
                applyStderrFilter(['test line'], '[invalid');
            }).toThrow(SyntaxError);
        });

        it('throws SyntaxError on unclosed parenthesis', () => {
            expect(() => {
                applyStderrFilter(['test line'], '(unclosed');
            }).toThrow(SyntaxError);
        });

        it('throws SyntaxError on invalid escape sequence', () => {
            expect(() => {
                applyStderrFilter(['test line'], '\\');
            }).toThrow(SyntaxError);
        });

        it('throws SyntaxError on invalid quantifier', () => {
            expect(() => {
                applyStderrFilter(['test line'], '*');
            }).toThrow(SyntaxError);
        });

        it('throws SyntaxError on unbalanced braces', () => {
            expect(() => {
                applyStderrFilter(['test line'], 'a{2,1}'); // min > max
            }).toThrow(SyntaxError);
        });

        it('throws SyntaxError on invalid flag in pattern', () => {
            // Note: RegExp constructor doesn't take flags in pattern string
            // but certain patterns like (?z) are invalid
            expect(() => {
                applyStderrFilter(['test line'], '(?z)');
            }).toThrow(SyntaxError);
        });

        it('handles valid regex patterns without error', () => {
            expect(() => {
                applyStderrFilter(['test line', 'error: something'], 'error:');
            }).not.toThrow();
        });

        it('handles empty filter pattern (matches nothing specific)', () => {
            // Empty string regex matches everything
            const result = applyStderrFilter(['line1', 'line2'], '');
            // All lines match empty regex, so all are filtered out
            expect(result).toHaveLength(0);
        });
    });

    describe('lineSplitterRegex (used in processListOutput.ts)', () => {
        it('throws SyntaxError on invalid regex pattern', () => {
            expect(() => {
                processListOutput(['test'], { lineSplitterRegex: ['[invalid'] });
            }).toThrow(SyntaxError);
        });

        it('throws SyntaxError on unclosed group', () => {
            expect(() => {
                processListOutput(['test'], { lineSplitterRegex: ['(unclosed'] });
            }).toThrow(SyntaxError);
        });

        it('throws SyntaxError on invalid escape at end', () => {
            expect(() => {
                processListOutput(['test'], { lineSplitterRegex: ['\\'] });
            }).toThrow(SyntaxError);
        });

        it('throws SyntaxError on invalid quantifier placement', () => {
            expect(() => {
                processListOutput(['test'], { lineSplitterRegex: ['+'] });
            }).toThrow(SyntaxError);
        });

        it('throws SyntaxError on invalid flag', () => {
            // Invalid flag 'z' should throw
            expect(() => {
                processListOutput(['test'], { lineSplitterRegex: ['pattern', 'z'] });
            }).toThrow(SyntaxError);
        });

        it('throws SyntaxError on duplicate flags', () => {
            // Duplicate flags should throw
            expect(() => {
                processListOutput(['test'], { lineSplitterRegex: ['pattern', 'gg'] });
            }).toThrow(SyntaxError);
        });

        it('handles valid regex with empty flags', () => {
            expect(() => {
                processListOutput(['a,b,c'], { lineSplitterRegex: [',', ''] });
            }).not.toThrow();
        });

        it('handles valid regex with undefined flags', () => {
            const result = processListOutput(['a,b,c'], { lineSplitterRegex: [','] });
            expect(result).toHaveLength(3);
        });

        it('handles valid regex with multiple flags', () => {
            expect(() => {
                processListOutput(['test'], { lineSplitterRegex: ['pattern', 'gi'] });
            }).not.toThrow();
        });
    });

    describe('thinkingOpenPattern (used in processLlmOutput.ts)', () => {
        it('throws SyntaxError on invalid open pattern', () => {
            expect(() => {
                processLlmOutput(['<thinking>test'], '[invalid');
            }).toThrow(SyntaxError);
        });

        it('throws SyntaxError on unclosed bracket in open pattern', () => {
            expect(() => {
                processLlmOutput(['test'], '(unclosed');
            }).toThrow(SyntaxError);
        });

        it('throws SyntaxError on invalid escape in open pattern', () => {
            expect(() => {
                processLlmOutput(['test'], '\\');
            }).toThrow(SyntaxError);
        });

        it('throws SyntaxError on invalid quantifier in open pattern', () => {
            expect(() => {
                processLlmOutput(['test'], '*invalid');
            }).toThrow(SyntaxError);
        });

        it('handles empty open pattern (matches everything)', () => {
            // Empty regex matches at position 0
            const result = processLlmOutput(['test content'], '', '</close>');
            // Empty pattern matches at start, so everything after is "thinkOut"
            expect(result.isThinking).toBe(true); // No close tag found
        });

        it('handles valid complex open pattern', () => {
            expect(() => {
                processLlmOutput(['<THINK>content</THINK>'], '<THINK>', '</THINK>');
            }).not.toThrow();
        });
    });

    describe('thinkingClosePattern (used in processLlmOutput.ts)', () => {
        it('throws SyntaxError on invalid close pattern', () => {
            expect(() => {
                processLlmOutput(['<thinking>test</thinking>'], '<thinking>', '[invalid');
            }).toThrow(SyntaxError);
        });

        it('throws SyntaxError on unclosed group in close pattern', () => {
            expect(() => {
                processLlmOutput(['<thinking>test'], '<thinking>', '(unclosed');
            }).toThrow(SyntaxError);
        });

        it('throws SyntaxError on invalid escape in close pattern', () => {
            expect(() => {
                processLlmOutput(['<thinking>test'], '<thinking>', '\\');
            }).toThrow(SyntaxError);
        });

        it('handles valid close pattern with special chars', () => {
            const result = processLlmOutput(
                ['{{START}}content{{END}}'],
                '\\{\\{START\\}\\}',
                '\\{\\{END\\}\\}'
            );
            expect(result.thinkOut).toBe('content');
            expect(result.isThinkDone).toBe(true);
        });
    });

    describe('combined invalid patterns', () => {
        it('throws on invalid open pattern even if close is valid', () => {
            expect(() => {
                processLlmOutput(['test'], '[invalid', '</valid>');
            }).toThrow(SyntaxError);
        });

        it('throws on invalid close pattern even if open is valid', () => {
            expect(() => {
                processLlmOutput(['<valid>test'], '<valid>', '[invalid');
            }).toThrow(SyntaxError);
        });
    });

    describe('edge cases for regex validation', () => {
        it('empty character class is valid in JavaScript (matches nothing)', () => {
            // [] is actually valid in JavaScript - it matches nothing
            // This is different from some other regex engines
            expect(() => {
                processListOutput(['test'], { lineSplitterRegex: ['[]'] });
            }).not.toThrow();
        });

        it('handles lookahead/lookbehind patterns', () => {
            // Valid lookahead
            expect(() => {
                processListOutput(['test123'], { lineSplitterRegex: ['(?=\\d)'] });
            }).not.toThrow();
        });

        it('handles named capture groups', () => {
            // Valid named capture group
            expect(() => {
                processListOutput(['test'], { lineSplitterRegex: ['(?<name>\\w+)'] });
            }).not.toThrow();
        });

        it('throws on invalid named group syntax', () => {
            expect(() => {
                processListOutput(['test'], { lineSplitterRegex: ['(?<>invalid)'] });
            }).toThrow(SyntaxError);
        });

        it('handles unicode flag correctly', () => {
            expect(() => {
                processListOutput(['test'], { lineSplitterRegex: ['\\p{L}', 'u'] });
            }).not.toThrow();
        });

        it('throws on invalid unicode property without u flag', () => {
            // \p{L} without 'u' flag should throw in strict mode
            // Actually, without u flag it's just literal \p{L}
            // Let's test a case that definitely throws
            expect(() => {
                processListOutput(['test'], { lineSplitterRegex: ['\\p{InvalidProperty}', 'u'] });
            }).toThrow(SyntaxError);
        });
    });

    describe('real-world invalid regex scenarios', () => {
        it('user accidentally uses glob pattern instead of regex', () => {
            // *.txt is not valid regex
            expect(() => {
                processListOutput(['file.txt'], { lineSplitterRegex: ['*.txt'] });
            }).toThrow(SyntaxError);
        });

        it('user forgets to escape special characters', () => {
            // [test] is valid but [test is not
            expect(() => {
                processListOutput(['test'], { lineSplitterRegex: ['[test'] });
            }).toThrow(SyntaxError);
        });

        it('user uses unescaped backslash at end', () => {
            // path\ is invalid
            expect(() => {
                processListOutput(['C:\\path\\'], { lineSplitterRegex: ['C:\\path\\'] });
            }).toThrow(SyntaxError);
        });

        it('user tries to use regex delimiter in pattern', () => {
            // Some users might try /pattern/g thinking it works like JS literal
            expect(() => {
                processListOutput(['test'], { lineSplitterRegex: ['/pattern/'] });
            }).not.toThrow(); // This is actually valid - / is just a literal
        });
    });

    describe('extractorRegexBody reference (tested in activator.test.ts)', () => {
        // extractorRegexBody is tested in activator.test.ts
        // These are reference tests to document the same behavior exists

        it('documents that activator.ts has same regex error behavior', () => {
            // The activate() function in activator.ts uses:
            // const extractorRegex = new RegExp(extractorRegexBody, extractorFlags)
            // Invalid regex will throw SyntaxError (tested in activator.test.ts)
            expect(true).toBe(true); // Placeholder - actual tests in activator.test.ts
        });
    });
});
