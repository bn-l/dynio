<script lang="ts">
    import type { FileKind } from "$lib/utils/fileKind.ts";

    export let kind: FileKind;

    const badges: Partial<Record<FileKind, string>> = { js: "JS", ts: "TS", py: "PY", rs: "RS", go: "GO", rb: "RB" };
</script>

<!-- Hand-drawn in the mockup's style: thin rounded outlines in the icon colour, and badges with
     a two-letter label for programming languages. The theme sets their colours (main.css). -->
{#if badges[kind]}
    <span class="file-badge" data-kind={kind}>{badges[kind]}</span>
{:else}
    <svg
        class="file-glyph"
        data-kind={kind}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
    >
        {#if kind === "book"}
            <path d="M12 7.5C10.2 6 7.8 5.25 4.5 5.25v12.5c3.3 0 5.7.75 7.5 2.25 1.8-1.5 4.2-2.25 7.5-2.25V5.25c-3.3 0-5.7.75-7.5 2.25Z" />
            <path d="M12 7.5V20" />
        {:else if kind === "code"}
            <path d="M8.5 7.5 4 12l4.5 4.5" />
            <path d="M15.5 7.5 20 12l-4.5 4.5" />
            <path d="M13.5 5.5l-3 13" />
        {:else if kind === "data"}
            <path d="M9 4.5h-.5a2 2 0 0 0-2 2v3A2.5 2.5 0 0 1 4.5 12a2.5 2.5 0 0 1 2 2.5v3a2 2 0 0 0 2 2H9" />
            <path d="M15 4.5h.5a2 2 0 0 1 2 2v3a2.5 2.5 0 0 0 2 2.5 2.5 2.5 0 0 0-2 2.5v3a2 2 0 0 1-2 2H15" />
        {:else if kind === "image"}
            <rect x="3.5" y="5" width="17" height="14" rx="2" />
            <circle cx="8.75" cy="9.75" r="1.5" />
            <path d="M3.5 17.5 9 12l4 4 2.5-2.5 5 5" />
        {:else if kind === "video"}
            <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
            <path d="M10.25 9.25v5.5L14.75 12Z" />
        {:else if kind === "audio"}
            <path d="M9 17.5V6.75l10-2.25v10.75" />
            <circle cx="6.75" cy="17.5" r="2.25" />
            <circle cx="16.75" cy="15.25" r="2.25" />
        {:else if kind === "archive"}
            <rect x="3.5" y="4.5" width="17" height="4.5" rx="1.25" />
            <path d="M5 9v8.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
            <path d="M10 13h4" />
        {:else if kind === "app"}
            <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
            <path d="M3.5 8.75h17" />
            <path d="M6.5 6.6h.01M8.75 6.6h.01" stroke-width="1.75" />
        {:else if kind === "folder"}
            <path d="M3.5 7.25a2 2 0 0 1 2-2h3.7l2.1 2.25h7.2a2 2 0 0 1 2 2v8.25a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
        {:else}
            <!-- file and text: a page with a folded corner (text adds lines) -->
            <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8Z" />
            <path d="M14 3.5V7a1 1 0 0 0 1 1h3.5" />
            {#if kind === "text"}
                <path d="M9 12.5h6M9 16h4" />
            {/if}
        {/if}
    </svg>
{/if}
