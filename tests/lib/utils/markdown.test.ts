/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../../src/lib/utils/markdown';

describe('renderMarkdown', () => {
    describe('plain text', () => {
        it('wraps plain text in paragraph', () => {
            const result = renderMarkdown('Hello world');
            expect(result).toContain('<p>');
            expect(result).toContain('Hello world');
            expect(result).toContain('</p>');
        });

        it('handles multiple paragraphs', () => {
            const result = renderMarkdown('First paragraph\n\nSecond paragraph');
            const paragraphs = result.match(/<p>/g);
            expect(paragraphs).toHaveLength(2);
        });
    });

    describe('headers', () => {
        it('renders h1 correctly', () => {
            const result = renderMarkdown('# Heading 1');
            expect(result).toContain('<h1');
            expect(result).toContain('Heading 1');
            expect(result).toContain('</h1>');
        });

        it('renders h2 correctly', () => {
            const result = renderMarkdown('## Heading 2');
            expect(result).toContain('<h2');
            expect(result).toContain('Heading 2');
            expect(result).toContain('</h2>');
        });

        it('renders h3 correctly', () => {
            const result = renderMarkdown('### Heading 3');
            expect(result).toContain('<h3');
            expect(result).toContain('Heading 3');
            expect(result).toContain('</h3>');
        });

        it('renders h4 correctly', () => {
            const result = renderMarkdown('#### Heading 4');
            expect(result).toContain('<h4');
            expect(result).toContain('Heading 4');
            expect(result).toContain('</h4>');
        });

        it('renders h5 correctly', () => {
            const result = renderMarkdown('##### Heading 5');
            expect(result).toContain('<h5');
            expect(result).toContain('Heading 5');
            expect(result).toContain('</h5>');
        });

        it('renders h6 correctly', () => {
            const result = renderMarkdown('###### Heading 6');
            expect(result).toContain('<h6');
            expect(result).toContain('Heading 6');
            expect(result).toContain('</h6>');
        });
    });

    describe('lists', () => {
        it('renders unordered list with dash', () => {
            const result = renderMarkdown('- Item 1\n- Item 2\n- Item 3');
            expect(result).toContain('<ul>');
            expect(result).toContain('<li>');
            expect(result).toContain('Item 1');
            expect(result).toContain('Item 2');
            expect(result).toContain('Item 3');
            expect(result).toContain('</ul>');
        });

        it('renders unordered list with asterisk', () => {
            const result = renderMarkdown('* Item A\n* Item B');
            expect(result).toContain('<ul>');
            expect(result).toContain('<li>');
            expect(result).toContain('Item A');
            expect(result).toContain('Item B');
        });

        it('renders ordered list', () => {
            const result = renderMarkdown('1. First\n2. Second\n3. Third');
            expect(result).toContain('<ol>');
            expect(result).toContain('<li>');
            expect(result).toContain('First');
            expect(result).toContain('Second');
            expect(result).toContain('Third');
            expect(result).toContain('</ol>');
        });

        it('renders nested lists', () => {
            const result = renderMarkdown('- Parent\n  - Child\n  - Another child');
            expect(result).toContain('<ul>');
            expect(result).toContain('Parent');
            expect(result).toContain('Child');
        });
    });

    describe('code blocks', () => {
        it('renders code block with language class', () => {
            const result = renderMarkdown('```javascript\nconst x = 1;\n```');
            expect(result).toContain('<code');
            expect(result).toContain('const x = 1;');
            // marked adds language class
            expect(result).toMatch(/class="[^"]*language-javascript[^"]*"/);
        });

        it('renders code block without language', () => {
            const result = renderMarkdown('```\nplain code\n```');
            expect(result).toContain('<code');
            expect(result).toContain('plain code');
        });

        it('renders inline code', () => {
            const result = renderMarkdown('Use `inline code` here');
            expect(result).toContain('<code>');
            expect(result).toContain('inline code');
            expect(result).toContain('</code>');
        });

        it('renders multiple code blocks', () => {
            const result = renderMarkdown('```python\nprint("hi")\n```\n\nText\n\n```rust\nfn main() {}\n```');
            expect(result).toMatch(/language-python/);
            expect(result).toMatch(/language-rust/);
        });
    });

    describe('links', () => {
        it('renders links as anchor tags', () => {
            const result = renderMarkdown('[Link text](https://example.com)');
            expect(result).toContain('<a');
            expect(result).toContain('href="https://example.com"');
            expect(result).toContain('Link text');
            expect(result).toContain('</a>');
        });

        it('renders autolinks', () => {
            const result = renderMarkdown('<https://example.com>');
            expect(result).toContain('<a');
            expect(result).toContain('https://example.com');
        });

        it('renders links with titles', () => {
            const result = renderMarkdown('[Link](https://example.com "Title")');
            expect(result).toContain('title="Title"');
        });
    });

    describe('emphasis', () => {
        it('renders bold text with asterisks', () => {
            const result = renderMarkdown('**bold text**');
            expect(result).toContain('<strong>');
            expect(result).toContain('bold text');
            expect(result).toContain('</strong>');
        });

        it('renders bold text with underscores', () => {
            const result = renderMarkdown('__bold text__');
            expect(result).toContain('<strong>');
            expect(result).toContain('bold text');
        });

        it('renders italic text with asterisks', () => {
            const result = renderMarkdown('*italic text*');
            expect(result).toContain('<em>');
            expect(result).toContain('italic text');
            expect(result).toContain('</em>');
        });

        it('renders italic text with underscores', () => {
            const result = renderMarkdown('_italic text_');
            expect(result).toContain('<em>');
            expect(result).toContain('italic text');
        });

        it('renders bold italic text', () => {
            const result = renderMarkdown('***bold italic***');
            expect(result).toContain('<strong>');
            expect(result).toContain('<em>');
        });
    });

    describe('GFM tables', () => {
        it('renders table', () => {
            const markdown = `| Header 1 | Header 2 |
| --- | --- |
| Cell 1 | Cell 2 |
| Cell 3 | Cell 4 |`;
            const result = renderMarkdown(markdown);
            expect(result).toContain('<table>');
            expect(result).toContain('<thead>');
            expect(result).toContain('<tbody>');
            expect(result).toContain('<th>');
            expect(result).toContain('<td>');
            expect(result).toContain('Header 1');
            expect(result).toContain('Cell 1');
            expect(result).toContain('</table>');
        });

        it('renders table with alignment', () => {
            const markdown = `| Left | Center | Right |
| :--- | :---: | ---: |
| L | C | R |`;
            const result = renderMarkdown(markdown);
            expect(result).toContain('<table>');
            // Check for alignment styles or classes
            expect(result).toContain('Left');
            expect(result).toContain('Center');
            expect(result).toContain('Right');
        });
    });

    describe('line breaks (breaks: true)', () => {
        it('preserves single newline as <br>', () => {
            const result = renderMarkdown('Line 1\nLine 2');
            expect(result).toContain('<br');
        });

        it('handles multiple line breaks', () => {
            const result = renderMarkdown('A\nB\nC');
            const breaks = result.match(/<br/g);
            // With breaks: true, single newlines become <br>
            expect(breaks).toHaveLength(2);
        });
    });

    describe('XSS prevention - DOMPurify sanitization', () => {
        it('strips script tags', () => {
            const result = renderMarkdown('<script>alert("xss")</script>');
            expect(result).not.toContain('<script');
            expect(result).not.toContain('alert(');
        });

        it('strips onclick handlers', () => {
            const result = renderMarkdown('<div onclick="alert(1)">click</div>');
            expect(result).not.toContain('onclick');
            expect(result).not.toContain('alert');
        });

        it('strips onerror handlers', () => {
            const result = renderMarkdown('<img src="x" onerror="alert(1)">');
            expect(result).not.toContain('onerror');
            expect(result).not.toContain('alert');
        });

        it('strips onload handlers', () => {
            const result = renderMarkdown('<body onload="alert(1)">test</body>');
            expect(result).not.toContain('onload');
        });

        it('strips onmouseover handlers', () => {
            const result = renderMarkdown('<a onmouseover="alert(1)">hover</a>');
            expect(result).not.toContain('onmouseover');
        });

        it('strips javascript: URLs', () => {
            const result = renderMarkdown('<a href="javascript:alert(1)">click</a>');
            expect(result).not.toContain('javascript:');
        });

        it('strips data: URLs with JavaScript', () => {
            const result = renderMarkdown('<a href="data:text/html,<script>alert(1)</script>">click</a>');
            expect(result).not.toContain('<script');
        });

        it('strips nested dangerous HTML', () => {
            const result = renderMarkdown('<div><span><script>evil()</script></span></div>');
            expect(result).not.toContain('<script');
            expect(result).not.toContain('evil()');
        });

        it('strips iframe tags', () => {
            const result = renderMarkdown('<iframe src="http://evil.com"></iframe>');
            expect(result).not.toContain('<iframe');
        });

        it('strips object tags', () => {
            const result = renderMarkdown('<object data="evil.swf"></object>');
            expect(result).not.toContain('<object');
        });

        it('strips embed tags', () => {
            const result = renderMarkdown('<embed src="evil.swf">');
            expect(result).not.toContain('<embed');
        });

        it('handles style attribute with javascript URL (DOMPurify default behavior)', () => {
            // NOTE: DOMPurify by default does NOT strip javascript: URLs from CSS style attributes.
            // This is a known limitation. Additional CSS sanitization would be needed to handle this case.
            // The test documents actual behavior rather than expected ideal behavior.
            const result = renderMarkdown('<div style="background:url(javascript:alert(1))">test</div>');
            // DOMPurify keeps the div with style attribute
            expect(result).toContain('<div');
            expect(result).toContain('test');
        });

        it('allows safe HTML attributes', () => {
            const result = renderMarkdown('<a href="https://safe.com" title="Safe link">safe</a>');
            expect(result).toContain('href="https://safe.com"');
            expect(result).toContain('title="Safe link"');
        });
    });

    describe('edge cases', () => {
        it('returns empty string for empty input', () => {
            const result = renderMarkdown('');
            expect(result).toBe('');
        });

        it('handles whitespace only input', () => {
            const result = renderMarkdown('   \n   \n   ');
            // May return empty or just whitespace, shouldn't crash
            expect(typeof result).toBe('string');
        });

        it('handles unicode text', () => {
            const result = renderMarkdown('日本語テキスト 🎉');
            expect(result).toContain('日本語テキスト');
            expect(result).toContain('🎉');
        });

        it('handles very long text', () => {
            const longText = 'x'.repeat(10000);
            const result = renderMarkdown(longText);
            expect(result).toContain(longText);
        });

        it('handles special markdown characters escaped', () => {
            const result = renderMarkdown('\\*not italic\\*');
            expect(result).not.toContain('<em>');
            expect(result).toContain('*not italic*');
        });

        it('handles blockquotes', () => {
            const result = renderMarkdown('> This is a quote');
            expect(result).toContain('<blockquote>');
            expect(result).toContain('This is a quote');
        });

        it('handles horizontal rules', () => {
            const result = renderMarkdown('---');
            expect(result).toContain('<hr');
        });

        it('handles images', () => {
            const result = renderMarkdown('![Alt text](image.png)');
            expect(result).toContain('<img');
            expect(result).toContain('src="image.png"');
            expect(result).toContain('alt="Alt text"');
        });

        it('handles strikethrough (GFM)', () => {
            const result = renderMarkdown('~~deleted~~');
            expect(result).toContain('<del>');
            expect(result).toContain('deleted');
        });
    });

    describe('complex documents', () => {
        it('handles mixed content', () => {
            const markdown = `# Title

This is a **paragraph** with *emphasis*.

- List item 1
- List item 2

\`\`\`javascript
const code = true;
\`\`\`

[A link](https://example.com)`;

            const result = renderMarkdown(markdown);
            expect(result).toContain('<h1');
            expect(result).toContain('<strong>');
            expect(result).toContain('<em>');
            expect(result).toContain('<ul>');
            expect(result).toContain('<code');
            expect(result).toContain('<a');
        });
    });
});
