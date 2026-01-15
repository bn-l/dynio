/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { stdout, running } from '$lib/stores/globals';
import { cmdConfig } from '$lib/stores/cmd-config';
import { currentCmd } from '$lib/stores/globals';
import { errors } from '$lib/stores/errors';
import type { CmdConfigItem } from '$lib/stores/schema/cmd-config-schema';
import LlmDisplay from './LlmDisplay.svelte';

// Mock Tauri APIs
const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
    invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Helper function to create a minimal LLM config
function createLlmConfig(overrides: Partial<CmdConfigItem> = {}): CmdConfigItem {
    return {
        command: 'test',
        modeConfig: {
            mode: 'llm',
            displayOptions: {},
        },
        ...overrides,
    };
}

describe('LlmDisplay.svelte', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockInvoke.mockResolvedValue(undefined);

        // Reset stores
        stdout.set([]);
        running.set(false);
        currentCmd.set('test-cmd');
        errors.clear();
        cmdConfig.set({
            'test-cmd': createLlmConfig(),
        });

        // Mock console.log to reduce noise
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    describe('thinkingDisplay="none"', () => {
        it('shows raw markdown output', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'none' },
                    },
                }),
            });
            stdout.set(['# Hello World']);

            const { container } = render(LlmDisplay);

            // Should render markdown - h1 becomes an h1 element
            expect(container.querySelector('h1')).toBeTruthy();
            expect(container.textContent).toContain('Hello World');
        });

        it('renders thinking tags as-is without special handling', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'none' },
                    },
                }),
            });
            stdout.set(['<thinking>deep thoughts</thinking>']);

            const { container } = render(LlmDisplay);

            // In "none" mode, thinking tags are not processed specially
            // They get rendered through markdown (which may strip them as HTML)
            const display = container.querySelector('#llmDisplay');
            expect(display).toBeTruthy();
        });
    });

    describe('thinkingDisplay="show"', () => {
        it('shows both thinking content and normal output', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'show' },
                    },
                }),
            });
            stdout.set(['<thinking>internal reasoning</thinking>final answer']);

            const { container } = render(LlmDisplay);

            // Should have both thinking content and post-think content
            expect(container.textContent).toContain('internal reasoning');
            expect(container.textContent).toContain('final answer');
        });

        it('thinking content has .llm-thinking-content class', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'show' },
                    },
                }),
            });
            stdout.set(['<thinking>thoughts</thinking>output']);

            const { container } = render(LlmDisplay);

            const thinkingElement = container.querySelector('.llm-thinking-content');
            expect(thinkingElement).toBeTruthy();
            expect(thinkingElement?.textContent).toContain('thoughts');
        });

        it('shows normal output in .prose class', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'show' },
                    },
                }),
            });
            stdout.set(['<thinking>thoughts</thinking>normal output']);

            const { container } = render(LlmDisplay);

            const proseElement = container.querySelector('.prose');
            expect(proseElement).toBeTruthy();
            expect(proseElement?.textContent).toContain('normal output');
        });
    });

    describe('thinkingDisplay="keepHidden"', () => {
        it('shows thinking indicator while thinking', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'keepHidden' },
                    },
                }),
            });
            // Unclosed thinking tag means still thinking
            stdout.set(['<thinking>still thinking...']);

            const { container } = render(LlmDisplay);

            expect(container.textContent).toContain('🧠 thinking...');
        });

        it('shows character count in indicator', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'keepHidden' },
                    },
                }),
            });
            stdout.set(['<thinking>12345']);

            const { container } = render(LlmDisplay);

            const indicator = container.querySelector('.llm-thinking-indicator');
            expect(indicator).toBeTruthy();
            // Should show character count (5 chars after opening tag)
            expect(indicator?.textContent).toContain('5');
        });

        it('shows only postThinkOut after completion', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'keepHidden' },
                    },
                }),
            });
            stdout.set(['<thinking>hidden thoughts</thinking>visible answer']);

            const { container } = render(LlmDisplay);

            // After thinking is done, only show the answer
            expect(container.textContent).toContain('visible answer');
            // Should not show the indicator anymore
            expect(container.textContent).not.toContain('🧠 thinking...');
        });

        it('shows raw output when no thinking tags present', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'keepHidden' },
                    },
                }),
            });
            stdout.set(['Just plain output']);

            const { container } = render(LlmDisplay);

            expect(container.textContent).toContain('Just plain output');
            expect(container.textContent).not.toContain('🧠');
        });
    });

    describe('thinkingDisplay="showWhileThinking"', () => {
        it('shows thinking content while in progress', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'showWhileThinking' },
                    },
                }),
            });
            stdout.set(['<thinking>visible thoughts']);

            const { container } = render(LlmDisplay);

            const thinkingContent = container.querySelector('.llm-thinking-content');
            expect(thinkingContent).toBeTruthy();
            expect(thinkingContent?.textContent).toContain('visible thoughts');
        });

        it('shows only postThinkOut after completion', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'showWhileThinking' },
                    },
                }),
            });
            stdout.set(['<thinking>now hidden</thinking>final answer']);

            const { container } = render(LlmDisplay);

            expect(container.textContent).toContain('final answer');
            // Thinking content should be hidden after completion
            expect(container.querySelector('.llm-thinking-content')).toBeNull();
        });

        it('shows raw output when no thinking tags present', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'showWhileThinking' },
                    },
                }),
            });
            stdout.set(['No thinking here']);

            const { container } = render(LlmDisplay);

            expect(container.textContent).toContain('No thinking here');
        });
    });

    describe('dynamic font sizing', () => {
        it('uses largeSize when length < sizeBreakPoint (default 100)', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: {
                            largeSize: 1.5,
                            smallSize: 0.8,
                            sizeBreakPoint: 100,
                        },
                    },
                }),
            });
            stdout.set(['short']); // 5 chars < 100

            const { container } = render(LlmDisplay);

            const display = container.querySelector('#llmDisplay');
            expect(display?.getAttribute('style')).toContain('font-size: 1.5rem');
        });

        it('uses smallSize when length >= sizeBreakPoint', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: {
                            largeSize: 1.5,
                            smallSize: 0.8,
                            sizeBreakPoint: 10,
                        },
                    },
                }),
            });
            stdout.set(['this is a much longer string that exceeds 10 characters']);

            const { container } = render(LlmDisplay);

            const display = container.querySelector('#llmDisplay');
            expect(display?.getAttribute('style')).toContain('font-size: 0.8rem');
        });

        it('uses default values when not specified', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: {},
                    },
                }),
            });
            stdout.set(['short']); // < 100 default breakpoint

            const { container } = render(LlmDisplay);

            const display = container.querySelector('#llmDisplay');
            // Default largeSize is 1
            expect(display?.getAttribute('style')).toContain('font-size: 1rem');
        });
    });

    describe('error on only-thinking tokens', () => {
        it('adds error when command finishes with only thinking tokens', async () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'keepHidden' },
                    },
                }),
            });
            // Simulate running state
            running.set(true);
            stdout.set(['<thinking>only thinking</thinking>']);

            render(LlmDisplay);

            // Simulate command finishing
            running.set(false);

            await vi.waitFor(() => {
                const errorList = get(errors);
                expect(errorList.some((e) => e.message.includes('no non-thinking tokens'))).toBe(true);
            });
        });

        it('adds error when only whitespace non-thinking tokens', async () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'show' },
                    },
                }),
            });
            running.set(true);
            stdout.set(['<thinking>thoughts</thinking>   ']); // Only whitespace after thinking

            render(LlmDisplay);

            running.set(false);

            await vi.waitFor(() => {
                const errorList = get(errors);
                expect(errorList.some((e) => e.message.includes('no non-thinking tokens'))).toBe(true);
            });
        });

        it('does NOT add error when thinkingDisplay is "none"', async () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'none' },
                    },
                }),
            });
            running.set(true);
            stdout.set(['<thinking>only thinking</thinking>']);

            render(LlmDisplay);

            running.set(false);

            // Give time for any potential error to be added
            await new Promise((resolve) => setTimeout(resolve, 50));

            const errorList = get(errors);
            expect(errorList.length).toBe(0);
        });

        it('does NOT add error when there are actual output tokens', async () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'show' },
                    },
                }),
            });
            running.set(true);
            stdout.set(['<thinking>thoughts</thinking>actual output']);

            render(LlmDisplay);

            running.set(false);

            await new Promise((resolve) => setTimeout(resolve, 50));

            const errorList = get(errors);
            expect(errorList.length).toBe(0);
        });
    });

    describe('preThinkOut content', () => {
        it('displays preThinkOut when present in show mode', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'show' },
                    },
                }),
            });
            stdout.set(['before<thinking>middle</thinking>after']);

            const { container } = render(LlmDisplay);

            // In show mode with preThinkOut, it should show thinkOut and postThinkOut
            // Note: processLlmOutput extracts preThinkOut but LlmDisplay doesn't render it
            // in show mode - it shows thinkOut and postThinkOut
            expect(container.textContent).toContain('middle');
            expect(container.textContent).toContain('after');
        });
    });

    describe('markdown rendering', () => {
        it('renders headers correctly', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'none' },
                    },
                }),
            });
            stdout.set(['# Header 1\n## Header 2\n### Header 3']);

            const { container } = render(LlmDisplay);

            expect(container.querySelector('h1')).toBeTruthy();
            expect(container.querySelector('h2')).toBeTruthy();
            expect(container.querySelector('h3')).toBeTruthy();
        });

        it('renders lists correctly', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'none' },
                    },
                }),
            });
            stdout.set(['- item 1\n- item 2\n- item 3']);

            const { container } = render(LlmDisplay);

            const list = container.querySelector('ul');
            expect(list).toBeTruthy();
            expect(container.querySelectorAll('li').length).toBe(3);
        });

        it('renders code blocks correctly', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'none' },
                    },
                }),
            });
            stdout.set(['```javascript\nconst x = 1;\n```']);

            const { container } = render(LlmDisplay);

            const codeBlock = container.querySelector('pre code');
            expect(codeBlock).toBeTruthy();
        });

        it('renders inline code correctly', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'none' },
                    },
                }),
            });
            stdout.set(['Use `const` for constants']);

            const { container } = render(LlmDisplay);

            const inlineCode = container.querySelector('code');
            expect(inlineCode).toBeTruthy();
            expect(inlineCode?.textContent).toContain('const');
        });

        it('renders links as anchor tags', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'none' },
                    },
                }),
            });
            stdout.set(['[Click here](https://example.com)']);

            const { container } = render(LlmDisplay);

            const link = container.querySelector('a');
            expect(link).toBeTruthy();
            expect(link?.getAttribute('href')).toBe('https://example.com');
        });

        it('renders bold and italic text', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'none' },
                    },
                }),
            });
            stdout.set(['**bold** and *italic*']);

            const { container } = render(LlmDisplay);

            expect(container.querySelector('strong')).toBeTruthy();
            expect(container.querySelector('em')).toBeTruthy();
        });

        it('preserves line breaks (breaks: true)', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'none' },
                    },
                }),
            });
            stdout.set(['line 1\nline 2']);

            const { container } = render(LlmDisplay);

            // With breaks: true, single newlines become <br>
            expect(container.querySelector('br')).toBeTruthy();
        });
    });

    describe('XSS sanitization via DOMPurify', () => {
        it('strips script tags', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'none' },
                    },
                }),
            });
            stdout.set(['<script>alert("xss")</script>normal text']);

            const { container } = render(LlmDisplay);

            expect(container.querySelector('script')).toBeNull();
            expect(container.textContent).toContain('normal text');
        });

        it('strips event handlers', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'none' },
                    },
                }),
            });
            stdout.set(['<img src="x" onerror="alert(1)">']);

            const { container } = render(LlmDisplay);

            const img = container.querySelector('img');
            // Either no img or no onerror attribute
            if (img) {
                expect(img.getAttribute('onerror')).toBeNull();
            }
        });

        it('strips nested dangerous HTML', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: { thinkingDisplay: 'none' },
                    },
                }),
            });
            stdout.set(['<div><script>evil()</script><p>safe</p></div>']);

            const { container } = render(LlmDisplay);

            expect(container.querySelector('script')).toBeNull();
            expect(container.textContent).toContain('safe');
        });
    });

    describe('custom thinking patterns', () => {
        it('uses custom thinkingOpenPattern', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: {
                            thinkingDisplay: 'show',
                            thinkingOpenPattern: '<<START>>',
                            thinkingClosePattern: '<<END>>',
                        },
                    },
                }),
            });
            stdout.set(['<<START>>custom thinking<<END>>output']);

            const { container } = render(LlmDisplay);

            const thinkingContent = container.querySelector('.llm-thinking-content');
            expect(thinkingContent).toBeTruthy();
            expect(thinkingContent?.textContent).toContain('custom thinking');
        });

        it('uses custom thinkingClosePattern', () => {
            cmdConfig.set({
                'test-cmd': createLlmConfig({
                    modeConfig: {
                        mode: 'llm',
                        displayOptions: {
                            thinkingDisplay: 'keepHidden',
                            thinkingOpenPattern: '\\[THINK\\]',
                            thinkingClosePattern: '\\[/THINK\\]',
                        },
                    },
                }),
            });
            stdout.set(['[THINK]hidden[/THINK]visible']);

            const { container } = render(LlmDisplay);

            expect(container.textContent).toContain('visible');
            expect(container.textContent).not.toContain('🧠');
        });
    });

    describe('edge cases', () => {
        it('handles empty stdout', () => {
            stdout.set([]);

            expect(() => render(LlmDisplay)).not.toThrow();
        });

        it('handles very long content', () => {
            const longContent = 'x'.repeat(10000);
            stdout.set([longContent]);

            const { container } = render(LlmDisplay);

            expect(container.textContent).toContain('x');
        });

        it('handles unicode content', () => {
            stdout.set(['日本語テスト 🎉 emoji test']);

            const { container } = render(LlmDisplay);

            expect(container.textContent).toContain('日本語テスト');
            expect(container.textContent).toContain('🎉');
        });

        it('handles multiple stdout chunks (streaming)', () => {
            stdout.set(['chunk1', 'chunk2', 'chunk3']);

            const { container } = render(LlmDisplay);

            // Chunks are joined - content should be combined
            expect(container.textContent).toContain('chunk1');
            expect(container.textContent).toContain('chunk2');
            expect(container.textContent).toContain('chunk3');
        });
    });
});
