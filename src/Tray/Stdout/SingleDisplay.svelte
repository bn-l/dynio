

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
    import { hotkeys } from "$lib/actions/hotkeys.ts";
    import { activate } from "$lib/utils/activator.ts";

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


<svelte:body
    use:hotkeys={{
        handler(_event) {
            // This is un-ideal. Needs to be joined with the actual split character.
            // Single display should probably not be used because of this or should have 
            // the activation option removed.
            activate(processedOutput.join(" "), $currentCmdConfig?.activationOptions);
        },
        keys: ["Enter"],
        enabled:  true,
    }}
/>