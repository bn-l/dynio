

<div
    id="outputSingle"
    class="flex flex-col justify-stretch items-stretch pb-2 pt-3"
>
    <div
        id="output"
        class="grid grid-cols-10 gap-3"
    >
        <div
            id="outputValue"
            class="col-span-9 flex-row-start"
        >
            <div
                style={`font-size: ${fontSize}rem`}
            >
                {#if $currentCmdConfig?.outputOptions?.parseAnsiColors}
                    <span
                        class="whitespace-pre-wrap"
                    >   
                        {@html processedOutput}
                    </span> 
                {:else}
                    <span
                        class="whitespace-pre-wrap"
                    >
                        {processedOutput}
                    </span>
                {/if}
            </div>
        </div>
    </div>

</div>


<script lang="ts">

    import { hotkeys } from "$lib/actions/hotkeys.ts";
    import { currentFocus } from "$lib/stores/globals.ts";
    import { currentCmdConfig } from "$lib/stores/cmd-config.ts";
    import { stdout } from "$lib/stores/globals.ts";
    import { activate } from "$lib/utils/activator.ts";
    import { AnsiUp } from "ansi_up";
    import stripAnsi from 'strip-ansi';

    const ansi_up = new AnsiUp();

    let displayOptions = $currentCmdConfig?.outputOptions?.display?.type === "single" ?
        $currentCmdConfig?.outputOptions?.display?.options: 
        undefined;
    $: joinedStdout = $stdout.join("\n");
    $: processedOutput = $currentCmdConfig?.outputOptions?.parseAnsiColors ? 
        ansi_up.ansi_to_html(joinedStdout): 
        joinedStdout;

    $: fontSize = displayOptions?.sizeBreakPoint && 
        stripAnsi(joinedStdout).length < displayOptions?.sizeBreakPoint ? 
            displayOptions?.largeSize : 
            displayOptions?.smallSize;

    function onActivation(text: string) {
        (text: string) => activate(text, $currentCmdConfig?.activationOptions)
    }

</script> 