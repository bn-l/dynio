import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { activate } from './activator';
import { errors } from '$lib/stores/errors';
import { get } from 'svelte/store';

// Mock Tauri APIs
const mockWriteText = vi.fn();
const mockOpenPath = vi.fn();
const mockInvoke = vi.fn();

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
    writeText: (...args: unknown[]) => mockWriteText(...args),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
    openPath: (...args: unknown[]) => mockOpenPath(...args),
}));

vi.mock('@tauri-apps/api/core', () => ({
    invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Mock console.log
const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('activate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        errors.clear();
        mockWriteText.mockResolvedValue(undefined);
        mockOpenPath.mockResolvedValue(undefined);
        mockInvoke.mockResolvedValue(undefined);
    });

    afterEach(() => {
        errors.clear();
    });

    describe('activateAction="copy"', () => {
        it('calls writeText with the text', async () => {
            await activate('test text', { activateAction: 'copy' });

            expect(mockWriteText).toHaveBeenCalledWith('test text');
            expect(mockOpenPath).not.toHaveBeenCalled();
        });

        it('calls hide_main after copy', async () => {
            await activate('test', { activateAction: 'copy' });

            expect(mockInvoke).toHaveBeenCalledWith('hide_main');
        });
    });

    describe('activateAction="open"', () => {
        it('calls openPath with the text', async () => {
            await activate('/path/to/file', { activateAction: 'open' });

            expect(mockOpenPath).toHaveBeenCalledWith('/path/to/file');
            expect(mockWriteText).not.toHaveBeenCalled();
        });

        it('calls hide_main after open', async () => {
            await activate('/path', { activateAction: 'open' });

            expect(mockInvoke).toHaveBeenCalledWith('hide_main');
        });
    });

    describe('default activateAction (undefined)', () => {
        it('defaults to copy when activateAction not specified', async () => {
            await activate('text', {});

            expect(mockWriteText).toHaveBeenCalledWith('text');
        });

        it('defaults to copy when options use default', async () => {
            await activate('text');

            expect(mockWriteText).toHaveBeenCalledWith('text');
        });
    });

    describe('extractorRegexBody with match', () => {
        it('extracts text using regex', async () => {
            await activate('prefix:extracted:suffix', {
                activateAction: 'copy',
                extractorRegexBody: ':([^:]+):',
            });

            // Default extracts match[0] which is ":extracted:"
            expect(mockWriteText).toHaveBeenCalledWith(':extracted:');
        });

        it('extracts full match when no group specified', async () => {
            await activate('hello123world', {
                activateAction: 'copy',
                extractorRegexBody: '\\d+',
            });

            expect(mockWriteText).toHaveBeenCalledWith('123');
        });
    });

    describe('extractorRegexBody with extractorFlags', () => {
        it('applies case-insensitive flag', async () => {
            await activate('HelloWORLD', {
                activateAction: 'copy',
                extractorRegexBody: 'world',
                extractorFlags: 'i',
            });

            expect(mockWriteText).toHaveBeenCalledWith('WORLD');
        });

        it('applies global flag (still returns first match)', async () => {
            await activate('a1b2c3', {
                activateAction: 'copy',
                extractorRegexBody: '\\d',
                extractorFlags: 'g',
            });

            expect(mockWriteText).toHaveBeenCalledWith('1');
        });
    });

    describe('extractorRegexBody with extractorGroup', () => {
        it('extracts specific capture group', async () => {
            await activate('name: John, age: 30', {
                activateAction: 'copy',
                extractorRegexBody: 'name: (\\w+)',
                extractorGroup: 1,
            });

            expect(mockWriteText).toHaveBeenCalledWith('John');
        });

        it('extracts nested group', async () => {
            await activate('data(value(inner))', {
                activateAction: 'copy',
                extractorRegexBody: 'data\\((value\\((\\w+)\\))\\)',
                extractorGroup: 2,
            });

            expect(mockWriteText).toHaveBeenCalledWith('inner');
        });
    });

    describe('extractorRegexBody with invalid group number', () => {
        it('adds error when group index does not exist', async () => {
            await activate('test123', {
                activateAction: 'copy',
                extractorRegexBody: '(\\d+)',
                extractorGroup: 5, // Only group 0 and 1 exist
            });

            const errorList = get(errors);
            expect(errorList.length).toBe(1);
            expect(errorList[0].message).toContain('failed to extract');
        });
    });

    describe('extractorRegexBody no match', () => {
        it('adds error to store when regex does not match', async () => {
            await activate('no numbers here', {
                activateAction: 'copy',
                extractorRegexBody: '\\d+',
            });

            const errorList = get(errors);
            expect(errorList.length).toBe(1);
            expect(errorList[0].message).toContain("didn't match");
            expect(errorList[0].type).toBe('js');
        });
    });

    describe('invalid/malformed extractorRegexBody', () => {
        it('throws on invalid regex syntax', async () => {
            await expect(
                activate('test', {
                    activateAction: 'copy',
                    extractorRegexBody: '[invalid(regex',
                })
            ).rejects.toThrow();
        });

        it('throws on unclosed group', async () => {
            await expect(
                activate('test', {
                    activateAction: 'copy',
                    extractorRegexBody: '(unclosed',
                })
            ).rejects.toThrow();
        });
    });

    describe('openContaining=true', () => {
        it('calls trim_path to get parent directory', async () => {
            mockInvoke.mockImplementation((cmd: string) => {
                if (cmd === 'trim_path') return Promise.resolve('/parent/dir');
                return Promise.resolve(undefined);
            });

            await activate('/parent/dir/file.txt', { activateAction: 'open' }, true);

            expect(mockInvoke).toHaveBeenCalledWith('trim_path', { path: '/parent/dir/file.txt' });
            expect(mockOpenPath).toHaveBeenCalledWith('/parent/dir');
        });

        it('passes trimmed path to copy action', async () => {
            mockInvoke.mockImplementation((cmd: string) => {
                if (cmd === 'trim_path') return Promise.resolve('/parent');
                return Promise.resolve(undefined);
            });

            await activate('/parent/child', { activateAction: 'copy' }, true);

            expect(mockWriteText).toHaveBeenCalledWith('/parent');
        });
    });

    describe('openContaining=true with non-path text', () => {
        it('handles trim_path error gracefully', async () => {
            mockInvoke.mockImplementation((cmd: string) => {
                if (cmd === 'trim_path') return Promise.reject(new Error('Not a valid path'));
                return Promise.resolve(undefined);
            });

            await activate('not a path', { activateAction: 'copy' }, true);

            const errorList = get(errors);
            expect(errorList.length).toBe(1);
            expect(errorList[0].type).toBe('tauri');
        });
    });

    describe('hideOnActivation=false', () => {
        it('does not call hide_main', async () => {
            await activate('text', { activateAction: 'copy', hideOnActivation: false });

            expect(mockInvoke).not.toHaveBeenCalledWith('hide_main');
        });
    });

    describe('hideOnActivation=true (default)', () => {
        it('calls hide_main when true', async () => {
            await activate('text', { activateAction: 'copy', hideOnActivation: true });

            expect(mockInvoke).toHaveBeenCalledWith('hide_main');
        });

        it('calls hide_main when undefined (defaults to true)', async () => {
            await activate('text', { activateAction: 'copy' });

            expect(mockInvoke).toHaveBeenCalledWith('hide_main');
        });
    });

    describe('error from Tauri writeText', () => {
        it('adds error to store with tauri type', async () => {
            mockWriteText.mockRejectedValue(new Error('Clipboard failed'));

            await activate('text', { activateAction: 'copy' });

            const errorList = get(errors);
            expect(errorList.length).toBe(1);
            expect(errorList[0].type).toBe('tauri');
            expect(errorList[0].message).toContain('Could not copy');
        });
    });

    describe('error from Tauri openPath', () => {
        it('adds error to store with tauri type', async () => {
            mockOpenPath.mockRejectedValue(new Error('File not found'));

            await activate('/nonexistent', { activateAction: 'open' });

            const errorList = get(errors);
            expect(errorList.length).toBe(1);
            expect(errorList[0].type).toBe('tauri');
            expect(errorList[0].message).toContain('Could not open');
        });
    });

    describe('text logged to console before processing', () => {
        it('logs text at start of function', async () => {
            await activate('logged text', { activateAction: 'copy' });

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('logged text'));
        });
    });

    describe('activateAction="command"', () => {
        it('calls spawn_detached with command path and arguments', async () => {
            await activate('file.txt', {
                activateAction: 'command',
                commandPath: '/usr/bin/code',
                commandArguments: ['--new-window'],
            });

            expect(mockInvoke).toHaveBeenCalledWith('spawn_detached', {
                program: '/usr/bin/code',
                arguments: ['--new-window', 'file.txt'],
                currentDir: undefined,
            });
        });

        it('includes currentDir when specified', async () => {
            await activate('file.txt', {
                activateAction: 'command',
                commandPath: '/usr/bin/code',
                commandCurrentDir: '/home/user',
            });

            expect(mockInvoke).toHaveBeenCalledWith('spawn_detached', {
                program: '/usr/bin/code',
                arguments: ['file.txt'],
                currentDir: '/home/user',
            });
        });

        it('appends extracted text as final argument', async () => {
            await activate('target.txt', {
                activateAction: 'command',
                commandPath: 'vim',
                commandArguments: ['-O'],
                extractorRegexBody: '(\\w+\\.\\w+)',
                extractorGroup: 1,
            });

            expect(mockInvoke).toHaveBeenCalledWith('spawn_detached', {
                program: 'vim',
                arguments: ['-O', 'target.txt'],
                currentDir: undefined,
            });
        });
    });

    describe('edge cases', () => {
        it('handles empty text', async () => {
            await activate('', { activateAction: 'copy' });

            expect(mockWriteText).toHaveBeenCalledWith('');
        });

        it('handles text with special characters', async () => {
            await activate('path/with spaces/and "quotes"', { activateAction: 'copy' });

            expect(mockWriteText).toHaveBeenCalledWith('path/with spaces/and "quotes"');
        });

        it('handles unicode text', async () => {
            await activate('日本語ファイル.txt', { activateAction: 'open' });

            expect(mockOpenPath).toHaveBeenCalledWith('日本語ファイル.txt');
        });

        it('handles very long text', async () => {
            const longText = 'x'.repeat(10000);
            await activate(longText, { activateAction: 'copy' });

            expect(mockWriteText).toHaveBeenCalledWith(longText);
        });
    });
});
