

<ClearablePanel 
    panelHeading="Stderr"
    onClear={() => {
        $stderr = [];
    }}
>
    {#each $stderr as err}
        <div
            class="py-1 text-sm"
        >
            {err}
        </div>
    {/each}
</ClearablePanel>


<script lang="ts">

// ! stderr can be basically anything. 
    // E.g. a stack trace, explanation, etc.
    // Display as a list is not suitable and can't be added to 
    // special "errors" store.

    import { stderr } from "$lib/stores/globals.ts";
    
    import ClearablePanel from "$lib/utils/ClearablePanel.svelte";

</script>