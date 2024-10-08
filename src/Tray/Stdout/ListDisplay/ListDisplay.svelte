
<div 
    id="listDisplay"
    class="h-79 border-0 border-solid flex flex-col px-3"
>
    {#if !displayOptions?.hideCount}
        <!-- Item count, consider removing -->
        <div class="text-right py-1 pr-3">
            {items.length}
        </div>       
    {/if}

    <div 
        class="border-solid border-0 border-red-500 flex-grow nice-scroll overflow-x-hidden p-0"
        style={displayOptions?.fontSize ? `font-size: ${displayOptions.fontSize}rem` : ""}
    >
        {#each items as item, index (item)}
            <div
                id={`item-${index}`}
                class={`${index === selectedIndex ? "bg-orange-200" : "hover:bg-orange-100 m-0 p-0"}`}
            >
                <div
                    class="flex-row-start cursor-pointer break-all p-[1.4ex]"
                    on:click={() => {
                        selectedIndex = index;
                        onActivation?.(item);
                    }}
                    on:contextmenu={(event) => {
                        selectedIndex = index;
                        onActivation?.(item, true);
                        event.preventDefault();
                    }}
                >
                    {#if parseAnsiColors}
                        {@html item}
                    {:else}
                        {item}
                    {/if}
                </div>
            </div>
        {/each}
    </div>
</div>

<script lang="ts">
    import { debounce } from "lodash-es";
    import { hotkeys } from "$lib/actions/hotkeys.ts";
    import { currentCmdConfig } from "$lib/stores/cmd-config.ts";
    import { stdout } from "$lib/stores/globals.ts";
    import { activate } from "$lib/utils/activator.ts";
    import { processListOutput } from "./processListOutput.ts";
    import stripAnsi from "strip-ansi";
    

    $: parseAnsiColors = $currentCmdConfig?.outputOptions?.parseAnsiColors;
    $: display = $currentCmdConfig?.outputOptions?.display; 
    $: displayOptions = display?.type === "list" ? display.options : undefined;


    // If list doesn't go back to 0 on new output
    // beforeUpdate(() => {
    //     selectedIndex = 0;
    // });

    function onActivation(text: string, openContaining: boolean = false) {
        console.log(`calling activator with: "${text.replace(/<.*?>/gm, '')}"`);
        void activate(text, $currentCmdConfig?.activationOptions, openContaining);
    }


    let items: string[] = [];
    const { lineSplitter, lineSplitterRegex, maxLineLength } = displayOptions ?? {};
    // NB: Output reversing is done in the stdout listener in App.svelete
    $: items = processListOutput($stdout, {
        maxLineLength,
        lineSplitter,
        lineSplitterRegex,
        parseAnsiColors,
    });
 

    // let items = []; // Items to actually display
    // $: items = processedOutput.slice(0, displayCount); 
    // onMount(() => {
    //     const interval = setInterval(() => {
    //         // Increase displayCount 10% of processedOutput, up to the length of processedOutput
    //         if (displayCount < processedOutput.length) {
    //             displayCount = Math.min(displayCount + processedOutput.length*0.10, processedOutput.length);
    //         }
    //         else {
    //             clearInterval(interval);
    //         }
    //     }, 100);

    //     return () => {
    //         clearInterval(interval);
    //     };
    // });

    let selectedIndex = 0;

    $: {
        if (selectedIndex !== undefined && items.length > 0) {
            const activeItemId = `item-${selectedIndex}`;
            const element = document.getElementById(activeItemId);
            if (element) {
                element.scrollIntoView({
                    behavior: 'instant',
                    block: 'nearest'
                });
            }
        }
    }

    const upDownListHandler = debounce(
        (e: KeyboardEvent, indexChange: number) => {
            e.preventDefault();
            // If we're going back (indexChange < 0), don't go to less than 0.
            //  if we're going forward (indexChange > 0), don't go to more than items.length - 1
            const index =
                indexChange < 0
                    ? Math.max(selectedIndex + indexChange, 0)
                    : Math.min(selectedIndex + indexChange, items.length - 1);

            selectedIndex = index;
        },
        16,
        { leading: true, trailing: false },
    ); 

    // When the tray is not focussed show a "ghost" version of the active highlight


</script>


<svelte:body
    use:hotkeys={{
        handler(event) {
            upDownListHandler(event, -1);
        },
        keys: ["ArrowUp"],
        enabled: true,
    }}
    use:hotkeys={{
        handler(event) {
            upDownListHandler(event, 1);
        },
        keys: ["ArrowDown"],
        enabled: true,
    }}
    use:hotkeys={{
        handler() {
            console.log("enter pressed")
            if($currentCmdConfig?.runOnEnter) return;
            onActivation(stripAnsi($stdout[selectedIndex]));
        },
        keys: ["Enter"],
        enabled: true,
    }}
    use:hotkeys={{
        handler() {
            console.log("ctrl + enter pressed")
            onActivation(stripAnsi($stdout[selectedIndex]));
        },
        keys: ["Enter"],
        modifiers: ["CmdOrCtrl"],
        enabled: true,
    }}
    use:hotkeys={{
        handler: () => {
            console.log("opening containing");
            if($currentCmdConfig?.activationOptions?.isPath) {
                onActivation(stripAnsi($stdout[selectedIndex]), true);
            }
        },
        keys: ["o"],
        modifiers: ["CmdOrCtrl"],
        enabled: true,
    }}
    
/>