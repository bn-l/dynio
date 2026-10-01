import { describe, it, expect } from 'vitest';
import { fileKind } from '$lib/utils/fileKind';

describe('fileKind', () => {
    describe('extension table', () => {
        it.each([
            ['/a/b/script.js', 'js'],
            ['/a/b/comp.jsx', 'js'],
            ['/a/b/types.ts', 'ts'],
            ['/a/b/comp.tsx', 'ts'],
            ['/a/b/tool.py', 'py'],
            ['/a/b/main.rs', 'rs'],
            ['/a/b/main.go', 'go'],
            ['/a/b/app.rb', 'rb'],
            ['/a/b/run.sh', 'code'],
            ['/a/b/page.html', 'code'],
            ['/a/b/App.svelte', 'code'],
            ['/a/b/Info.plist', 'data'],
            ['/a/b/config.yaml', 'data'],
            ['/a/b/sheet.xlsx', 'data'],
            ['/a/b/README.md', 'text'],
            ['/a/b/report.pdf', 'text'],
            ['/a/b/shot.png', 'image'],
            ['/a/b/logo.svg', 'image'],
            ['/a/b/clip.mov', 'video'],
            ['/a/b/song.flac', 'audio'],
            ['/a/b/backup.tgz', 'archive'],
            ['/a/b/archive.zip', 'archive'],
            ['/Applications/Safari.app', 'app'],
        ])('%s → %s', (path, kind) => {
            expect(fileKind(path)).toBe(kind);
        });

        it('ignores extension case', () => {
            expect(fileKind('/X/FILE.JS')).toBe('js');
            expect(fileKind('/X/Photo.JpEg')).toBe('image');
        });

        it('falls back to a generic file for unknown extensions', () => {
            expect(fileKind('/x/y.unknownext')).toBe('file');
            expect(fileKind('/x/deck.pptx')).toBe('file');
        });

        it('does not match extensions by prefix or inherited object keys', () => {
            expect(fileKind('/x/y.jsx2')).toBe('file');
            expect(fileKind('/x/y.constructor')).toBe('file');
            expect(fileKind('/x/y.toString')).toBe('file');
            expect(fileKind('/x/y.__proto__')).toBe('file');
        });
    });

    describe('file name parsing', () => {
        it('uses only the last extension when there are several dots', () => {
            expect(fileKind('/x/a.tar.gz')).toBe('archive');
            expect(fileKind('/x/jquery.min.js')).toBe('js');
        });

        it('ignores dots in folder names', () => {
            expect(fileKind('/a.b/c')).toBe('file');
            expect(fileKind('/proj.js/README')).toBe('file');
            expect(fileKind('/Users/bml/Library/Application Scripts/com.apple.x/data')).toBe('file');
        });

        it('treats a leading dot as part of the name, not an extension', () => {
            expect(fileKind('/x/.zshrc')).toBe('file');
            expect(fileKind('/x/.js')).toBe('file');
            expect(fileKind('.gitignore')).toBe('file');
        });

        it('still finds the extension of a dotfile that has one', () => {
            expect(fileKind('/x/.eslintrc.json')).toBe('data');
        });

        it('handles a name ending in a dot', () => {
            expect(fileKind('/x/file.')).toBe('file');
        });

        it('handles names without any slashes', () => {
            expect(fileKind('script.py')).toBe('py');
        });

        it('handles files with no extension', () => {
            expect(fileKind('/usr/share/terminfo/61/addsvp60')).toBe('file');
        });

        it('handles names containing emoji or other non-ASCII characters', () => {
            expect(fileKind('/x/Neue Haas Grotesk Text Pro👪1.png')).toBe('image');
            expect(fileKind('/x/résumé.pdf')).toBe('text');
        });

        it('handles Windows paths', () => {
            expect(fileKind('C:\\Users\\x\\y.ts')).toBe('ts');
            expect(fileKind('C:\\Users\\x.d\\notes')).toBe('file');
        });

        it('ignores surrounding whitespace and line endings', () => {
            expect(fileKind('/x/y.js\r')).toBe('js');
            expect(fileKind('  /x/y.js  ')).toBe('js');
            expect(fileKind('/x/y.js\n')).toBe('js');
        });

        it('returns a generic file for empty or blank input', () => {
            expect(fileKind('')).toBe('file');
            expect(fileKind('   ')).toBe('file');
        });
    });

    describe('folders', () => {
        it('treats a trailing slash as a folder', () => {
            expect(fileKind('/Users/bml/projects/')).toBe('folder');
            expect(fileKind('C:\\Users\\x\\')).toBe('folder');
            expect(fileKind('/')).toBe('folder');
        });

        it('treats a trailing slash as a folder even when the folder name has an extension', () => {
            expect(fileKind('/x/proj.js/')).toBe('folder');
            expect(fileKind('/Applications/Safari.app/')).toBe('folder');
        });

        it('treats a trailing slash followed by whitespace as a folder', () => {
            expect(fileKind('/x/dir/\r')).toBe('folder');
        });
    });

    describe('man pages', () => {
        it.each([
            '/usr/share/man/man5/slapo-dds.5',
            '/usr/share/man/man1/ls.1.gz',
            '/usr/share/man/man3/printf.3pm',
            '/opt/homebrew/share/man/man1/rg.1',
        ])('%s is a man page', (path) => {
            expect(fileKind(path)).toBe('book');
        });

        it('requires a man folder', () => {
            expect(fileKind('/x/archive.5')).toBe('file');
            expect(fileKind('/x/manual/notes.1')).toBe('file');
            expect(fileKind('/x/human/notes.1')).toBe('file');
        });

        it('requires a section number after the dot', () => {
            expect(fileKind('/usr/share/man/whatis')).toBe('file');
            expect(fileKind('/usr/share/man/index.html')).toBe('code');
        });

        it('does not treat a gzipped non-man file under man as a man page', () => {
            expect(fileKind('/usr/share/man/backup.tar.gz')).toBe('archive');
        });
    });
});
