/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import type { FileKind } from '$lib/utils/fileKind';
import FileIcon from '../../../../src/Tray/Stdout/ListDisplay/FileIcon.svelte';

const glyphKinds: FileKind[] = ['file', 'text', 'book', 'code', 'data', 'image', 'video', 'audio', 'archive', 'app', 'folder'];
const badgeKinds: [FileKind, string][] = [['js', 'JS'], ['ts', 'TS'], ['py', 'PY'], ['rs', 'RS'], ['go', 'GO'], ['rb', 'RB']];

describe('FileIcon.svelte', () => {
    afterEach(() => cleanup());

    it.each(glyphKinds)('%s draws an outline glyph', (kind) => {
        const { container } = render(FileIcon, { kind });

        const svg = container.querySelector('svg.file-glyph');
        expect(svg?.getAttribute('data-kind')).toBe(kind);
        expect(svg?.querySelectorAll('path, rect, circle').length).toBeGreaterThan(0);
        expect(container.querySelector('.file-badge')).toBeNull();
    });

    it.each(badgeKinds)('%s draws a badge labelled %s', (kind, label) => {
        const { container } = render(FileIcon, { kind });

        const badge = container.querySelector('.file-badge');
        expect(badge?.getAttribute('data-kind')).toBe(kind);
        expect(badge?.textContent).toBe(label);
        expect(container.querySelector('svg')).toBeNull();
    });

    it('draws each glyph kind differently', () => {
        const drawings = glyphKinds.map((kind) => {
            const { container } = render(FileIcon, { kind });
            const html = container.querySelector('svg')?.innerHTML.replace(/<!--.*?-->/g, '') ?? '';
            cleanup();
            return html;
        });

        expect(new Set(drawings).size).toBe(glyphKinds.length);
    });

    it('updates when the kind changes', async () => {
        const { container, component } = render(FileIcon, { kind: 'file' });

        component.$set({ kind: 'js' });
        await Promise.resolve();

        expect(container.querySelector('.file-badge')?.textContent).toBe('JS');
        expect(container.querySelector('svg')).toBeNull();
    });
});
