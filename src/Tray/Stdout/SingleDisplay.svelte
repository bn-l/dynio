

<div
    id="outputSingle"
    class="flex flex-col justify-stretch items-stretch gap-4 pb-2 pt-3"
>
    <div
        id="output"
        class="grid grid-cols-10 gap-3"
    >
        <div
            id="outputValue"
            class={`col-span-9 flex-row-start \
                ${displayOptions?.sizeBreakPoint && 
                    processedOutput.length < displayOptions?.sizeBreakPoint ? 
                        displayOptions?.largeSize : 
                        displayOptions?.smallSize
                }`
            }
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


<script lang="ts">

    import { hotkeys } from "$lib/actions/hotkeys.ts";
    import { currentFocus } from "$lib/stores/globals.ts";
    import { currentCmdConfig } from "$lib/stores/cmd-config.ts";
    import { stdout } from "$lib/stores/globals.ts";
    import { activate } from "$lib/utils/activator.ts";
    import { AnsiUp } from "ansi_up";

    const ansi_up = new AnsiUp();

    $: display = $currentCmdConfig?.outputOptions?.display;
    $: displayOptions = display?.type === "single" ? display?.options : undefined;
    $: processedOutput = $currentCmdConfig?.outputOptions?.parseAnsiColors ? 
        ansi_up.ansi_to_html($stdout.join("\n")) : 
        $stdout.join("\n");

    function onActivation(text: string) {
        (text: string) => activate(text, $currentCmdConfig?.activationOptions)
    }

    $: hotKeysEnabled = (
        $currentCmdConfig?.mode === "runOnKeystroke" || 
        $currentCmdConfig?.mode === "runOnEnter" && $currentFocus === "tray"
    );

</script>

<svelte:body use:hotkeys={{
    handler(event) {
        onActivation?.(processedOutput);
    },
    keys: ["Enter"],
    enabled: hotKeysEnabled
}} />