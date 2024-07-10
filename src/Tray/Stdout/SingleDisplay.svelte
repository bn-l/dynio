

<div
    id="singleDisplay"
    class="flex flex-col justify-stretch items-stretch p-4 h-71 nice-scroll overflow-x-hidden select-all"
>
    <div
        id="singleDisplayContainer"
        class=""
    >
        <div
            style={`font-size: ${fontSize}rem`}
        >
            {#each processedOutput as output}
                <div
                    class="whitespace-pre-wrap m-1 mb-2 break-all hyphens-auto"
                >   
                    {#if $currentCmdConfig?.outputOptions?.parseAnsiColors}
                        {@html output}
                    {:else}
                        {output}
                    {/if}
                </div> 
            {/each}
        </div>
    </div>

</div>


<script lang="ts">

    import { currentCmdConfig } from "$lib/stores/cmd-config.ts";
    import { stdout } from "$lib/stores/globals.ts";
    import { AnsiUp } from "ansi_up";
    import stripAnsi from 'strip-ansi';

    const ansi_up = new AnsiUp();

    let displayOptions = $currentCmdConfig?.outputOptions?.display?.type === "single" ?
        $currentCmdConfig?.outputOptions?.display?.options: 
        undefined;
    $: processedOutput = $currentCmdConfig?.outputOptions?.parseAnsiColors ? 
        $stdout.map(text => ansi_up.ansi_to_html(text)): 
        $stdout;

    $: fontSize = displayOptions?.sizeBreakPoint && 
        stripAnsi($stdout.join()).length < displayOptions?.sizeBreakPoint ? 
            displayOptions?.largeSize : 
            displayOptions?.smallSize;


</script> 