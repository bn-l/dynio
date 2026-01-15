import { describe, it, expect } from 'vitest';
import { processLlmOutput } from '../../../../src/Tray/Stdout/LlmDisplay/processLlmOutput';

describe('processLlmOutput', () => {
    describe('no thinking tags present', () => {
        it('returns raw as postThinkOut with isThinking=false, isThinkDone=false', () => {
            const result = processLlmOutput(['Hello world']);

            expect(result.raw).toBe('Hello world');
            expect(result.postThinkOut).toBe('Hello world');
            expect(result.preThinkOut).toBe('');
            expect(result.thinkOut).toBe('');
            expect(result.isThinking).toBe(false);
            expect(result.isThinkDone).toBe(false);
            expect(result.thinkCharCount).toBe(0);
        });

        it('handles plain text with multiple chunks', () => {
            const result = processLlmOutput(['Hello ', 'world ', 'test']);

            expect(result.raw).toBe('Hello world test');
            expect(result.postThinkOut).toBe('Hello world test');
            expect(result.isThinking).toBe(false);
            expect(result.isThinkDone).toBe(false);
        });
    });

    describe('<thinking>...</thinking> pattern', () => {
        it('correctly extracts preThinkOut, thinkOut, postThinkOut', () => {
            const result = processLlmOutput(['Before<thinking>Inside thinking</thinking>After']);

            expect(result.raw).toBe('Before<thinking>Inside thinking</thinking>After');
            expect(result.preThinkOut).toBe('Before');
            expect(result.thinkOut).toBe('Inside thinking');
            expect(result.postThinkOut).toBe('After');
            expect(result.isThinkDone).toBe(true);
            expect(result.isThinking).toBe(false);
            expect(result.thinkCharCount).toBe('Inside thinking'.length);
        });

        it('handles thinking at the start (no preThinkOut)', () => {
            const result = processLlmOutput(['<thinking>Thinking content</thinking>Response']);

            expect(result.preThinkOut).toBe('');
            expect(result.thinkOut).toBe('Thinking content');
            expect(result.postThinkOut).toBe('Response');
            expect(result.isThinkDone).toBe(true);
        });

        it('handles thinking at the end (no postThinkOut)', () => {
            const result = processLlmOutput(['Intro<thinking>Just thinking</thinking>']);

            expect(result.preThinkOut).toBe('Intro');
            expect(result.thinkOut).toBe('Just thinking');
            expect(result.postThinkOut).toBe('');
            expect(result.isThinkDone).toBe(true);
        });
    });

    describe('<think>...</think> pattern', () => {
        it('works with alternate think tags', () => {
            const result = processLlmOutput(['Before<think>My thoughts</think>After']);

            expect(result.preThinkOut).toBe('Before');
            expect(result.thinkOut).toBe('My thoughts');
            expect(result.postThinkOut).toBe('After');
            expect(result.isThinkDone).toBe(true);
            expect(result.isThinking).toBe(false);
        });
    });

    describe('<|thinking|>...<|/thinking|> pattern (Claude-style)', () => {
        it('works with pipe-delimited tags', () => {
            const result = processLlmOutput(['Start<|thinking|>Claude thinking<|/thinking|>End']);

            expect(result.preThinkOut).toBe('Start');
            expect(result.thinkOut).toBe('Claude thinking');
            expect(result.postThinkOut).toBe('End');
            expect(result.isThinkDone).toBe(true);
        });
    });

    describe('[thinking]...[/thinking] pattern', () => {
        it('works with bracket syntax', () => {
            const result = processLlmOutput(['Preamble[thinking]Bracket thoughts[/thinking]Conclusion']);

            expect(result.preThinkOut).toBe('Preamble');
            expect(result.thinkOut).toBe('Bracket thoughts');
            expect(result.postThinkOut).toBe('Conclusion');
            expect(result.isThinkDone).toBe(true);
        });
    });

    describe('custom patterns', () => {
        it('overrides default open and close patterns', () => {
            const result = processLlmOutput(
                ['Before{{THINK}}Custom thinking{{/THINK}}After'],
                '\\{\\{THINK\\}\\}',
                '\\{\\{/THINK\\}\\}'
            );

            expect(result.preThinkOut).toBe('Before');
            expect(result.thinkOut).toBe('Custom thinking');
            expect(result.postThinkOut).toBe('After');
            expect(result.isThinkDone).toBe(true);
        });

        it('custom pattern does not match default tags', () => {
            const result = processLlmOutput(
                ['Before<thinking>Default thinking</thinking>After'],
                '\\{\\{THINK\\}\\}',
                '\\{\\{/THINK\\}\\}'
            );

            // Should not find the custom pattern, so entire content goes to postThinkOut
            expect(result.postThinkOut).toBe('Before<thinking>Default thinking</thinking>After');
            expect(result.isThinking).toBe(false);
            expect(result.isThinkDone).toBe(false);
        });
    });

    describe('unclosed thinking tag (streaming)', () => {
        it('returns isThinking=true, isThinkDone=false when tag not closed', () => {
            const result = processLlmOutput(['Before<thinking>Still streaming thoughts...']);

            expect(result.preThinkOut).toBe('Before');
            expect(result.thinkOut).toBe('Still streaming thoughts...');
            expect(result.postThinkOut).toBe('');
            expect(result.isThinking).toBe(true);
            expect(result.isThinkDone).toBe(false);
            expect(result.thinkCharCount).toBe('Still streaming thoughts...'.length);
        });

        it('handles streaming with just opening tag', () => {
            const result = processLlmOutput(['<thinking>']);

            expect(result.preThinkOut).toBe('');
            expect(result.thinkOut).toBe('');
            expect(result.postThinkOut).toBe('');
            expect(result.isThinking).toBe(true);
            expect(result.isThinkDone).toBe(false);
            expect(result.thinkCharCount).toBe(0);
        });

        it('handles streaming with partial content after open tag', () => {
            const result = processLlmOutput(['<think>I am think', 'ing about']);

            expect(result.thinkOut).toBe('I am thinking about');
            expect(result.isThinking).toBe(true);
            expect(result.isThinkDone).toBe(false);
        });
    });

    describe('multiple stdout chunks joined correctly', () => {
        it('joins array with empty string', () => {
            const result = processLlmOutput(['chunk1', 'chunk2', 'chunk3']);

            expect(result.raw).toBe('chunk1chunk2chunk3');
        });

        it('joins thinking tag split across chunks', () => {
            const result = processLlmOutput(['<thin', 'king>content</thi', 'nking>done']);

            expect(result.preThinkOut).toBe('');
            expect(result.thinkOut).toBe('content');
            expect(result.postThinkOut).toBe('done');
            expect(result.isThinkDone).toBe(true);
        });

        it('handles many small chunks', () => {
            const chunks = '<thinking>test</thinking>'.split('');
            const result = processLlmOutput(chunks);

            expect(result.thinkOut).toBe('test');
            expect(result.isThinkDone).toBe(true);
        });
    });

    describe('empty stdout array', () => {
        it('returns empty raw and postThinkOut', () => {
            const result = processLlmOutput([]);

            expect(result.raw).toBe('');
            expect(result.postThinkOut).toBe('');
            expect(result.preThinkOut).toBe('');
            expect(result.thinkOut).toBe('');
            expect(result.isThinking).toBe(false);
            expect(result.isThinkDone).toBe(false);
            expect(result.thinkCharCount).toBe(0);
        });
    });

    describe('thinking block with content before and after', () => {
        it('correctly separates all three sections', () => {
            const result = processLlmOutput([
                'Here is my preamble. ',
                '<thinking>',
                'Let me think step by step...',
                '</thinking>',
                ' Here is my answer.',
            ]);

            expect(result.preThinkOut).toBe('Here is my preamble. ');
            expect(result.thinkOut).toBe('Let me think step by step...');
            expect(result.postThinkOut).toBe(' Here is my answer.');
            expect(result.isThinkDone).toBe(true);
        });
    });

    describe('multiple thinking blocks', () => {
        it('only detects the first thinking block', () => {
            const result = processLlmOutput([
                'Start<thinking>First</thinking>Middle<thinking>Second</thinking>End',
            ]);

            // Only the first thinking block should be detected
            expect(result.preThinkOut).toBe('Start');
            expect(result.thinkOut).toBe('First');
            // The rest (including second thinking block) goes to postThinkOut
            expect(result.postThinkOut).toBe('Middle<thinking>Second</thinking>End');
            expect(result.isThinkDone).toBe(true);
        });
    });

    describe('thinkCharCount calculation', () => {
        it('accurately counts characters in thinking content', () => {
            const thinkingContent = 'This is exactly 30 characters!';
            const result = processLlmOutput([`<thinking>${thinkingContent}</thinking>`]);

            expect(result.thinkCharCount).toBe(thinkingContent.length);
            expect(result.thinkCharCount).toBe(30);
        });

        it('counts zero when thinking block is empty', () => {
            const result = processLlmOutput(['<thinking></thinking>']);

            expect(result.thinkCharCount).toBe(0);
        });

        it('counts characters during streaming (unclosed tag)', () => {
            const result = processLlmOutput(['<thinking>12345']);

            expect(result.thinkCharCount).toBe(5);
            expect(result.isThinking).toBe(true);
        });

        it('includes whitespace in count', () => {
            const result = processLlmOutput(['<thinking>  spaces  </thinking>']);

            expect(result.thinkCharCount).toBe(10); // "  spaces  "
        });
    });

    describe('empty thinking block (immediately closed)', () => {
        it('handles <thinking></thinking> with no content', () => {
            const result = processLlmOutput(['<thinking></thinking>']);

            expect(result.preThinkOut).toBe('');
            expect(result.thinkOut).toBe('');
            expect(result.postThinkOut).toBe('');
            expect(result.isThinkDone).toBe(true);
            expect(result.isThinking).toBe(false);
            expect(result.thinkCharCount).toBe(0);
        });

        it('handles empty thinking with surrounding content', () => {
            const result = processLlmOutput(['Before<thinking></thinking>After']);

            expect(result.preThinkOut).toBe('Before');
            expect(result.thinkOut).toBe('');
            expect(result.postThinkOut).toBe('After');
            expect(result.isThinkDone).toBe(true);
        });
    });

    describe('thinking complete with empty postThinkOut and preThinkOut', () => {
        it('returns isThinkDone=true with empty pre/post content', () => {
            const result = processLlmOutput(['<thinking>Only thinking here</thinking>']);

            expect(result.preThinkOut).toBe('');
            expect(result.postThinkOut).toBe('');
            expect(result.thinkOut).toBe('Only thinking here');
            expect(result.isThinkDone).toBe(true);
            expect(result.isThinking).toBe(false);
            // This condition triggers the error in LlmDisplay component:
            // thinkingDisplay !== "none" && processed.isThinkDone && !processed.postThinkOut.trim() && !processed.preThinkOut.trim()
        });
    });

    describe('thinking complete with only whitespace in postThinkOut/preThinkOut', () => {
        it('flags allow error detection with whitespace-only pre/post', () => {
            const result = processLlmOutput(['   <thinking>Thoughts</thinking>   ']);

            expect(result.preThinkOut).toBe('   ');
            expect(result.postThinkOut).toBe('   ');
            expect(result.thinkOut).toBe('Thoughts');
            expect(result.isThinkDone).toBe(true);
            // trim() on pre/post would still be empty, allowing error detection
            expect(result.preThinkOut.trim()).toBe('');
            expect(result.postThinkOut.trim()).toBe('');
        });

        it('whitespace-only postThinkOut after thinking', () => {
            const result = processLlmOutput(['<thinking>Deep thoughts</thinking>\n\n\t']);

            expect(result.postThinkOut).toBe('\n\n\t');
            expect(result.postThinkOut.trim()).toBe('');
            expect(result.isThinkDone).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('handles newlines within thinking block', () => {
            const result = processLlmOutput(['<thinking>\nLine 1\nLine 2\n</thinking>']);

            expect(result.thinkOut).toBe('\nLine 1\nLine 2\n');
            expect(result.isThinkDone).toBe(true);
        });

        it('handles unicode in thinking content', () => {
            const result = processLlmOutput(['<thinking>思考中... 🤔</thinking>']);

            expect(result.thinkOut).toBe('思考中... 🤔');
            expect(result.isThinkDone).toBe(true);
        });

        it('handles markdown in thinking content', () => {
            const result = processLlmOutput([
                '<thinking>## Step 1\n- Item **bold**\n```code```</thinking>Response',
            ]);

            expect(result.thinkOut).toBe('## Step 1\n- Item **bold**\n```code```');
            expect(result.postThinkOut).toBe('Response');
        });

        it('handles very long thinking content', () => {
            const longContent = 'x'.repeat(100000);
            const result = processLlmOutput([`<thinking>${longContent}</thinking>`]);

            expect(result.thinkOut).toBe(longContent);
            expect(result.thinkCharCount).toBe(100000);
            expect(result.isThinkDone).toBe(true);
        });

        it('handles nested-looking tags (not actually nested)', () => {
            // The function doesn't support nesting - inner tags are just content
            const result = processLlmOutput([
                '<thinking>outer<thinking>inner</thinking>more</thinking>after',
            ]);

            // First </thinking> closes the block
            expect(result.thinkOut).toBe('outer<thinking>inner');
            expect(result.postThinkOut).toBe('more</thinking>after');
        });
    });
});
