
<DisplayWrapper padding="pl-2">
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
                    class="list-item-inner flex items-center gap-3 cursor-pointer"
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
                    {#if activationOptions?.isPath}
                        <span class="row-icon"><FileIcon kind={fileKind(item.raw)} /></span>
                    {/if}
                    <span class="row-text flex-1 min-w-0 break-all">
                        {#if parseAnsiColors}
                            {@html item.display}
                        {:else}
                            {item.display}
                        {/if}
                    </span>
                    <!-- On every row but only visible on the selected one, so moving the selection
                         never changes how a row's text wraps -->
                    <span class="row-hint" class:row-hint-hidden={index !== selectedIndex} aria-hidden="true">{activateKey}</span>
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
    import { fileKind } from "$lib/utils/fileKind.ts";
    import { processListOutput, type ProcessedItem } from "./processListOutput.ts";
    import DisplayWrapper from "$lib/utils/DisplayWrapper.svelte";
    import FileIcon from "./FileIcon.svelte";

    $: modeConfig = $currentCmdConfig?.modeConfig;
    $: parseAnsiColors = modeConfig?.displayOptions?.parseAnsiColors;
    $: displayOptions = modeConfig?.mode === "list" ? modeConfig.displayOptions : undefined;
    $: activationOptions = modeConfig?.mode === "list" ? modeConfig.activationOptions : undefined;
    $: runOnEnter = $currentCmdConfig?.runOnEnter;
    // Shared by the status bar and the selected row's hint so they can't disagree
    $: activateKey = runOnEnter ? `${keySymbols.cmd}+${keySymbols.enter}` : keySymbols.enter;

    $: {
        const actions: StatusBarAction[] = [
            { key: activateKey, label: activationOptions?.activateAction ?? "copy" },
        ];

        if (activationOptions?.isPath) {
            actions.push({ key: `${keySymbols.cmd}+O`, label: "reveal" });
        }

        console.debug("[DEBUG] ListDisplay: SETTING statusBar, actions:", actions.map(a => a.label).join(","), "count:", items.length);
        $statusBar = {
            actions,
            count: !displayOptions?.hideCount && items.length > 0 ? `${items.length} items` : ""
        };
    }

    onDestroy(() => {
        console.debug("[DEBUG] ListDisplay: onDestroy - CLEARING statusBar");
        $statusBar = { actions: [], count: "" };
    });


    // If list doesn't go back to 0 on new output
    // beforeUpdate(() => {
    //     selectedIndex = 0;
    // });

    function onActivation(text: string, openContaining: boolean = false) {
        console.debug(`calling activator with: "${text.replace(/<.*?>/gm, '')}"`);
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
        handler(event) {
            // Prevent up front: the debounce drops repeats, and Ctrl+K would delete the rest of the input line
            event.preventDefault();
            upDownListHandler(event, event.code === "KeyJ" ? 1 : -1);
        },
        codes: ["KeyJ", "KeyK"],
        modifiers: ["CmdOrCtrl"],
        enabled: true,
    }}
    use:hotkeys={{
        handler() {
            console.debug("enter pressed")
            if($currentCmdConfig?.runOnEnter) return;
            onActivation(items[selectedIndex].raw);
        },
        keys: ["Enter"],
        enabled: true,
    }}
    use:hotkeys={{
        handler() {
            console.debug("ctrl + enter pressed")
            onActivation(items[selectedIndex].raw);
        },
        keys: ["Enter"],
        modifiers: ["CmdOrCtrl"],
        enabled: true,
    }}
    use:hotkeys={{
        handler: () => {
            console.debug("opening containing");
            if(activationOptions?.isPath) {
                onActivation(items[selectedIndex].raw, true);
            }
        },
        keys: ["o"],
        modifiers: ["CmdOrCtrl"],
        enabled: true,
    }}

/>