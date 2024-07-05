
<div 
    class="h-79 border-2 border-solid flex flex-col"
>
    <!-- Item count, consider removing -->
    <div class="text-right p-2">
        {data.length}
    </div>

    <div class="border-solid border-2 border-red-500 flex-grow">
        <VList {data} let:item class="nice-scroll overflow-x-hidden p-0" bind:this={vlist}>
            <div
                class={`${item.index === selectedIndex ? "bg-orange-200" : "hover:bg-orange-100 m-0 p-0"} break-all`}
            >
                <div
                    class="flex-row-start cursor-pointer"
                    on:click={() => {
                        selectedIndex = item.index;
                        onActivation?.(item.line);
                    }}
                >
                    {#if $currentCmdConfig?.outputOptions?.parseAnsiColors}
                        {@html item.line}
                    {:else}
                        {item.line}
                    {/if}
                </div>
            </div>
        </VList>
    </div>
</div>

<script lang="ts">
    import { VList } from "virtua/svelte";
    import { beforeUpdate } from "svelte";
    import { debounce } from "lodash-es";
    import { hotkeys } from "$lib/actions/hotkeys.ts";
    import { currentFocus, currentTrayView } from "$lib/stores/globals.ts";
    import { currentCmdConfig } from "$lib/stores/cmd-config.ts";
    import { stdout } from "$lib/stores/globals.ts";
    import { activate } from "$lib/utils/activator.ts";
    import { processOutput } from "./processOutput.ts";

    $: display = $currentCmdConfig?.outputOptions?.display; 
    $: displayOptions = display?.type === "list" ? display.options : undefined;


    // If list doesn't go back to 0 on new output
    // beforeUpdate(() => {
    //     selectedIndex = 0;
    // });

    function onActivation(text: string, openContaining: boolean = false) {
        console.log("calling activator")
        void activate(text, $currentCmdConfig?.activationOptions, openContaining);
    }

    type Indexed = { line: string; index: number };

    let processedOutput: string[] = [];
    const { lineSplitter, lineSplitterRegex, maxLineLength } = displayOptions ?? {};
    $: processedOutput = processOutput($stdout, {
        maxLineLength,
        lineSplitter,
        lineSplitterRegex,
        parseAnsiColors: $currentCmdConfig?.outputOptions?.parseAnsiColors,
    });
    let data: Indexed[] = [];
    $: data = processedOutput.map((line, index) => ({ line, index }));

    console.log("In Listdisplay data length: ", data.length);

    let vlist: VList<Indexed>;
    let selectedIndex = 0;

    const upDownListHandler = debounce(
        (e: KeyboardEvent, indexChange: number) => {
            e.preventDefault();
            // If we're going back (indexChange < 0), don't go to less than 0.
            //  if we're going forward (indexChange > 0), don't go to more than items.length - 1
            const index =
                indexChange < 0
                    ? Math.max(selectedIndex + indexChange, 0)
                    : Math.min(selectedIndex + indexChange, data.length - 1);

            selectedIndex = index;

            vlist.scrollToIndex(index, {
                align: "nearest",
            });
        },
        16,
        { leading: true, trailing: false },
    ); 

    // When the tray is not focussed show a "ghost" version of the active highlight
    const activeClass = "bg-blue-300";
</script>


<svelte:body
    use:hotkeys={{
        handler(event) {
            if (event.key === "ArrowUp") {
                upDownListHandler(event, -1);
            } else if (event.key === "ArrowDown") {
                upDownListHandler(event, 1);
            } else if (event.key === "Enter") {
                console.log("enter pressed")
                onActivation(data[selectedIndex].line);
            }
        },
        keys: ["ArrowUp", "ArrowDown", "Enter"],
        enabled:  true,
    }}
    use:hotkeys={{
        handler: () => {
            console.log("opening containing");
            if($currentCmdConfig?.activationOptions?.isPath) {
                onActivation(data[selectedIndex].line, true);
            }
        },
        keys: ["o"],
        modifiers: ["CmdOrCtrl"],
        enabled:  true,
    }}
/>