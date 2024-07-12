

<div
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
                {#if $currentCmdConfig?.outputOptions?.parseAnsiColors}
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
    import { currentCmdConfig } from "$lib/stores/cmd-config.ts";
    import { stdout } from "$lib/stores/globals.ts";
    import stripAnsi from 'strip-ansi';
    // import { hotkeys } from "$lib/actions/hotkeys.ts";
    import { processSingleOutput } from "./processSingleOuput.ts";


    let displayOptions = $currentCmdConfig?.outputOptions?.display?.type === "single" ?
        $currentCmdConfig?.outputOptions?.display?.options: 
        undefined;

    $: processedOutput = processSingleOutput($stdout, $currentCmdConfig?.outputOptions);

    $: console.log(processedOutput);

    $: fontSize = displayOptions?.sizeBreakPoint && 
        stripAnsi($stdout.join()).length < displayOptions?.sizeBreakPoint ? 
            displayOptions?.largeSize : 
            displayOptions?.smallSize;


</script> 