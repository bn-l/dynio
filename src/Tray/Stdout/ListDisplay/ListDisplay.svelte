
<DisplayWrapper padding="px-2 pt-2">
    <div
        id="listDisplay"
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
                        onActivation?.(item.raw);
                    }}
                    on:contextmenu={(event) => {
                        selectedIndex = index;
                        onActivation?.(item.raw, true);
                        event.preventDefault();
                    }}
                >
                    {#if parseAnsiColors}
                        {@html item.display}
                    {:else}
                        {item.display}
                    {/if}
                </div>
            </div>
        {/each}
    </div>
</DisplayWrapper>

<script lang="ts">
    import { debounce } from "lodash-es";
    import { onDestroy } from "svelte";
    import { hotkeys } from "$lib/actions/hotkeys.ts";
    import { currentCmdConfig } from "$lib/stores/cmd-config.ts";
    import { stdout, statusBar, keySymbols } from "$lib/stores/globals.ts";
    import type { StatusBarAction } from "$lib/stores/globals.ts";
    import { activate } from "$lib/utils/activator.ts";
    import { processListOutput, type ProcessedItem } from "./processListOutput.ts";
    import DisplayWrapper from "$lib/utils/DisplayWrapper.svelte";

    $: modeConfig = $currentCmdConfig?.modeConfig;
    $: parseAnsiColors = modeConfig?.displayOptions?.parseAnsiColors;
    $: displayOptions = modeConfig?.mode === "list" ? modeConfig.displayOptions : undefined;
    $: activationOptions = modeConfig?.mode === "list" ? modeConfig.activationOptions : undefined;
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

        console.log("[DEBUG] ListDisplay: SETTING statusBar, actions:", actions.map(a => a.label).join(","), "count:", items.length);
        $statusBar = {
            actions,
            count: !displayOptions?.hideCount && items.length > 0 ? `${items.length} items` : ""
        };
    }

    onDestroy(() => {
        console.log("[DEBUG] ListDisplay: onDestroy - CLEARING statusBar");
        $statusBar = { actions: [], count: "" };
    });


    // If list doesn't go back to 0 on new output
    // beforeUpdate(() => {
    //     selectedIndex = 0;
    // });

    function onActivation(text: string, openContaining: boolean = false) {
        console.log(`calling activator with: "${text.replace(/<.*?>/gm, '')}"`);
        void activate(text, activationOptions, openContaining);
    }


    let items: ProcessedItem[] = [];
    // NB: Output reversing is done in the stdout listener in App.svelete
    $: items = processListOutput($stdout, {
        maxLineLength: displayOptions?.maxLineLength,
        lineSplitter: displayOptions?.lineSplitter,
        lineSplitterRegex: displayOptions?.lineSplitterRegex,
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
            onActivation(items[selectedIndex].raw);
        },
        keys: ["Enter"],
        enabled: true,
    }}
    use:hotkeys={{
        handler() {
            console.log("ctrl + enter pressed")
            onActivation(items[selectedIndex].raw);
        },
        keys: ["Enter"],
        modifiers: ["CmdOrCtrl"],
        enabled: true,
    }}
    use:hotkeys={{
        handler: () => {
            console.log("opening containing");
            if(activationOptions?.isPath) {
                onActivation(items[selectedIndex].raw, true);
            }
        },
        keys: ["o"],
        modifiers: ["CmdOrCtrl"],
        enabled: true,
    }}

/>