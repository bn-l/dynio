

<div
    id="tray"
    tabIndex={1}
    class="border-0 border-t-2 border-solid border-gray-300 relative overflow-hidden rounded-b-md h-[20rem] whitespace-pre-wrap"
    use:focusSync={"tray"}
>
    <svelte:component this={currentTray.component} {...currentTray.props} />
</div>

<script lang="ts">
    import { focusSync } from "$lib/actions/focusSync.ts";
    import { currentTrayView } from "$lib/stores/globals.ts";
    import Stdout from "./Stdout/Stdout.svelte";
    import Stderr from "./Stderr.svelte";
    import CmdSelector from "./CmdSelector.svelte";
    import ErrorList from "./ErrorList.svelte";

    import type { SvelteComponent } from "svelte";

    let currentTray: { component: new (...args: any[]) => SvelteComponent, props: any };

    $: {
        switch ($currentTrayView) {
            case "stdout":
                currentTray = { component: Stdout, props: {} };
                break;
            case "stderr":
                currentTray = { component: Stderr, props: {} };
                break;
            case "cmdSelector":
                currentTray = { component: CmdSelector, props: { showHotkeys: true } };
                break;
            case "errors":
                currentTray = { component: ErrorList, props: {} };
                break;
            default:
                currentTray = { component: Stdout, props: {} };
        }
    }
    
</script>

