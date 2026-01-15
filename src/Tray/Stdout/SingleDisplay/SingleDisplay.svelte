<DisplayWrapper padding="p-4">
    <div
        id="singleDisplay"
        style={`font-size: ${fontSize}rem`}
    >
        <div class="m-1 mb-2 hyphens-auto">
            {#if parseAnsiColors}
                {@html processedOutput}
            {:else}
                {processedOutput}
            {/if}
        </div>
    </div>
</DisplayWrapper>


<script lang="ts">
    import "./singleDisplay.css";
    import { onDestroy } from "svelte";
    import { currentCmdConfig } from "$lib/stores/cmd-config.ts";
    import { stdout, statusBar, keySymbols } from "$lib/stores/globals.ts";
    import type { StatusBarAction } from "$lib/stores/globals.ts";
    import stripAnsi from 'strip-ansi';
    import { processSingleOutput } from "./processSingleOuput.ts";
    import DisplayWrapper from "$lib/utils/DisplayWrapper.svelte";

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
    });

    $: processedOutput = processSingleOutput($stdout, displayOptions);

    $: console.debug(processedOutput);

    $: fontSize = displayOptions?.sizeBreakPoint && 
        stripAnsi($stdout.join()).length < displayOptions?.sizeBreakPoint ? 
            displayOptions?.largeSize : 
            displayOptions?.smallSize;


</script> 