
<div
    id="listDisplay"
    class="h-full flex flex-col"
>
    <div
        class="flex-grow nice-scroll overflow-x-hidden overflow-y-auto px-2 pt-2"
        style={displayOptions?.fontSize ? `font-size: ${displayOptions.fontSize}rem` : ""}
    >
        {#each items as item, index (index)}
            <div
                id={`item-${index}`}
                class="list-item {index === selectedIndex ? 'item-selected' : 'item-hover'}"
            >
                <div
                    class="list-item-inner cursor-pointer break-all"
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
    import { onDestroy } from "svelte";
    import { hotkeys } from "$lib/actions/hotkeys.ts";
    import { currentCmdConfig } from "$lib/stores/cmd-config.ts";
    import { stdout, statusBar, keySymbols } from "$lib/stores/globals.ts";
    import type { StatusBarAction } from "$lib/stores/globals.ts";
    import { activate } from "$lib/utils/activator.ts";
    import { processListOutput } from "./processListOutput.ts";
    import stripAnsi from "strip-ansi";


    $: parseAnsiColors = $currentCmdConfig?.outputOptions?.parseAnsiColors;
    $: display = $currentCmdConfig?.outputOptions?.display;
    $: displayOptions = display?.type === "list" ? display.options : undefined;
    $: activationOptions = $currentCmdConfig?.activationOptions;
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

        $statusBar = {
            actions,
            count: !displayOptions?.hideCount && items.length > 0 ? `${items.length} items` : ""
        };
    }

    onDestroy(() => {
        $statusBar = { actions: [], count: "" };
    });


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