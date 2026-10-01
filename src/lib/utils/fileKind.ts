/** The icon a list row shows. Two-letter language kinds render as filled badges. */
export type FileKind =
    | "file" | "text" | "book" | "code" | "data" | "image" | "video" | "audio" | "archive" | "app" | "folder"
    | "js" | "ts" | "py" | "rs" | "go" | "rb";

const kindGroups: [kind: FileKind, extensions: string[]][] = [
    ["js", ["js", "mjs", "cjs", "jsx"]],
    ["ts", ["ts", "mts", "cts", "tsx"]],
    ["py", ["py"]],
    ["rs", ["rs"]],
    ["go", ["go"]],
    ["rb", ["rb"]],
    ["code", ["c", "h", "cpp", "hpp", "java", "kt", "swift", "lua", "sh", "zsh", "bash", "fish", "php", "sql"]],
    ["code", ["html", "htm", "css", "scss", "vue", "svelte"]],
    ["data", ["json", "yaml", "yml", "toml", "plist", "xml", "csv", "xls", "xlsx"]],
    ["text", ["txt", "md", "rtf", "log", "pdf", "doc", "docx"]],
    ["image", ["png", "jpg", "jpeg", "gif", "webp", "heic", "tiff", "bmp", "svg", "ico", "avif"]],
    ["video", ["mp4", "mov", "mkv", "webm", "avi"]],
    ["audio", ["mp3", "wav", "flac", "m4a", "aac", "ogg"]],
    ["archive", ["zip", "gz", "tgz", "tar", "7z", "rar", "bz2", "xz", "dmg"]],
    ["app", ["app"]],
];

const kindByExtension = new Map(
    kindGroups.flatMap(([kind, extensions]) => extensions.map((ext): [string, FileKind] => [ext, kind])),
);

/**
 * Picks an icon kind for a path by looking at the text only (no disk lookups):
 * 1. A trailing slash means a folder.
 * 2. A file inside a "man" folder whose name ends in a dot and a digit (optionally
 *    gzipped, e.g. "ls.1.gz") is a man page.
 * 3. Otherwise the extension is the text after the last dot of the file name. A dot at
 *    the very start (".zshrc") doesn't count. It's looked up in the table above, falling
 *    back to a generic file.
 */
export function fileKind(path: string): FileKind {
    const trimmed = path.trim();
    if (/[\\/]$/.test(trimmed)) {
        return "folder";
    }

    const name = trimmed.split(/[\\/]/).pop() ?? "";
    if (/[\\/]man[\\/]/.test(trimmed) && /\.\d\w*(?:\.gz)?$/.test(name)) {
        return "book";
    }

    const dot = name.lastIndexOf(".");
    const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
    return kindByExtension.get(extension) ?? "file";
}
