<ClearablePanel
    panelHeading="Stderr"
    onClear={() => {
        $stderr = "";
    }}
>
    <pre class="stderr-content">{$stderr}</pre>
</ClearablePanel>


<script lang="ts">

// ! stderr can be basically anything. 
    // E.g. a stack trace, explanation, etc.
    // Display as a list is not suitable and can't be added to 
    // special "errors" store.

    import { stderr } from "$lib/stores/globals.ts";
    import ClearablePanel from "$lib/utils/ClearablePanel.svelte";
</script>

<style>
    .stderr-content {
        margin: 0;
        padding: 0.25rem 0;
        font-size: 0.875rem;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: inherit;
    }
</style>