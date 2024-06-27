

<div
    id="tray"
    tabIndex={1}
    class="border-0 border-t-2 border-solid border-gray-300 relative overflow-hidden rounded-b-md h-[20rem] whitespace-pre-wrap"
    use:focusSync={"tray"}
>
</div>

<script lang="ts">
    import { focusSync } from "$lib/actions/focusSync.ts";
    import { currentTrayView } from "$lib/stores/globals.ts";
    import Stdout from "./Stdout/Stdout.svelte";
    import type { SvelteComponent } from "svelte";

    let currentTray: {component: new (...args: any[]) => SvelteComponent, props: any};

    // switch
</script>

