

<div
    class="nice-scroll"
>
    <!-- Panel heading -->
    <div
        id="panelHeading"
        class=""
    >
        Stderr
    </div>
    <div
        class=""
        on:click={() => {
            $stderr = [];
        }}
    >
        clear
    </div>

    <!-- Display using code font and new lines should break --> 
    <div
        class=""
    >   
        {processedStderr}
    </div>
</div>

<script lang="ts">

// ! stderr can be basically anything. 
    // E.g. a stack trace, explanation, etc.
    // Display as a list is not suitable and can't be added to 
    // special "errors" store.

    import { stderr } from "$lib/stores/globals.ts";
    import { onMount } from "svelte";
    import { listen } from "@tauri-apps/api/event";
    import type { Event } from "@tauri-apps/api/event";

    $: processedStderr = $stderr.join("\n");

</script>