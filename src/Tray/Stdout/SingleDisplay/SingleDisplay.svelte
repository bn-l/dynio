

<div
    bind:this={scrollEl}
    id="singleDisplay"
    class="flex flex-col justify-stretch items-stretch p-4 h-71 nice-scroll overflow-x-hidden"
>
    <div
        id="singleDisplayContainer"
        class=""
    >
        <div
            style={`font-size: ${fontSize}rem`}
        >
            <div
                class=" m-1 mb-2 hyphens-auto"
            >   
                {#if parseAnsiColors}
                    {@html processedOutput}
                {:else}
                    {processedOutput}
                {/if}
            </div> 
        </div>
    </div>

</div>


<script lang="ts">

    import "./singleDisplay.css";
    import { onDestroy } from "svelte";
    import { currentCmdConfig } from "$lib/stores/cmd-config.ts";
    import { stdout, scrollContainer, statusBar, keySymbols } from "$lib/stores/globals.ts";
    import type { StatusBarAction } from "$lib/stores/globals.ts";
    import stripAnsi from 'strip-ansi';
    // import { hotkeys } from "$lib/actions/hotkeys.ts";
    import { processSingleOutput } from "./processSingleOuput.ts";

    let scrollEl: HTMLElement;
    $: $scrollContainer = scrollEl;

    $: modeConfig = $currentCmdConfig?.modeConfig;
    $: displayOptions = modeConfig?.mode === "single" ? modeConfig.displayOptions : undefined;
    $: parseAnsiColors = modeConfig?.displayOptions?.parseAnsiColors;
    $: activationOptions = modeConfig?.mode === "single" ? modeConfig.activationOptions : undefined;
    $: runOnEnter = $currentCmdConfig?.runOnEnter;

    $: {
        const actions: StatusBarAction[] = [];
        const activateAction = activationOptions?.activateAction ?? "copy";

        if (runOnEnter) {
            actions.push({ key: `${keySymbols.cmd}+${keySymbols.enter}`, label: activateAction });
        } else {
            actions.push({ key: keySymbols.enter, label: activateAction });
        }

        if (activationOptions?.isPath) {
            actions.push({ key: `${keySymbols.cmd}+O`, label: "reveal" });
        }

        $statusBar = { actions, count: "" };
    }

    onDestroy(() => {
        $statusBar = { actions: [], count: "" };
        $scrollContainer = null;
    });

    $: processedOutput = processSingleOutput($stdout, displayOptions);

    $: console.log(processedOutput);

    $: fontSize = displayOptions?.sizeBreakPoint && 
        stripAnsi($stdout.join()).length < displayOptions?.sizeBreakPoint ? 
            displayOptions?.largeSize : 
            displayOptions?.smallSize;


</script> 