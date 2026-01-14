
<div id="tray" class="relative overflow-hidden rounded-b-xl grid grid-rows-[1fr_auto] h-[20rem] w-full">
    <div class="tray-content overflow-hidden w-full">
        <svelte:component this={currentTray.component} {...currentTray.props} />
    </div>
    {#if showStatusBar}
        <StatusBar />
    {/if}
</div>

<script lang="ts">
    import { currentTrayView, statusBar, stderr } from "$lib/stores/globals.ts";
    import { errors } from "$lib/stores/errors.ts";
    import { currentCmdConfig } from "$lib/stores/cmd-config.ts";
    import StatusBar from "./StatusBar.svelte";
    import Stdout from "./Stdout/Stdout.svelte";
    import Stderr from "./Stderr.svelte";
    import CmdSelector from "./CmdSelector.svelte";
    import ErrorList from "./ErrorList.svelte";

    import type { SvelteComponent } from "svelte";



    let currentTray: { component: new (...args: any[]) => SvelteComponent, props: any };

    $: hasIndicators = $stderr.length > 0 || $errors.length > 0;
    $: hasActionsOrCount = $statusBar.actions.length > 0 || $statusBar.count;
    $: isLlmMode = $currentTrayView === "stdout" && $currentCmdConfig?.modeConfig?.mode === "llm";
    $: showStatusBar = isLlmMode ? (hasIndicators || $statusBar.actions.length > 0) : (hasActionsOrCount || hasIndicators);

    $: {
        switch ($currentTrayView) {
            case "stdout":
                currentTray = { component: Stdout, props: {} };
                break;
            case "stderr":
                currentTray = { component: Stderr, props: {} };
                break;
            case "cmdSelector":
                currentTray = { component: CmdSelector, props: { } };
                break;
            case "errors":
                currentTray = { component: ErrorList, props: {} };
                break;
            default:
                currentTray = { component: Stdout, props: {} };
        }
    }
    
</script>

