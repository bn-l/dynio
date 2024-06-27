

<!-- Item count, consider removing -->
<div class="">
    {data.length}
</div>

<VList {data} let:item class="nice-scroll" getKey={(i) => i.line} bind:this={vlist}>
    <div
        class={`grid grid-cols-10 gap-3 ${item.index === selectedIndex ? activeClass : ""}`}
    >
        <div
            class="col-span-9 flex-row-start"
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

        {#if displayOptions?.showHotkeys}
            <div class="col-span-1 flex-row-center">
                {#if item.index + 1 < 10}
                    <code>
                        {" "}
                        ⌥
                        {item.index + 1}
                    </code>
                {/if}
            </div>
        {/if}
    </div>
</VList>

<script lang="ts">
    import { VList } from "virtua/svelte";
    import { beforeUpdate } from "svelte";
    import { debounce } from "lodash-es";
    import { hotkeys } from "$lib/actions/hotkeys.ts";
    import { currentFocus } from "$lib/stores/globals.ts";
    import { currentCmdConfig } from "$lib/stores/cmd-config.ts";
    import { stdout } from "$lib/stores/globals.ts";
    import { activate } from "$lib/utils/activator.ts";
    import { processOutput } from "./processOutput.ts";

    $: display = $currentCmdConfig?.outputOptions?.display;
    $: displayOptions = display?.type === "list" ? display?.options : undefined;
    $: processedOutput = processOutput($stdout, {
        maxLineLength: displayOptions?.maxLineLength,
        lineSplitter: displayOptions?.lineSplitter,
        lineSplitterRegex: displayOptions?.lineSplitterRegex,
        parseAnsiColors: $currentCmdConfig?.outputOptions?.parseAnsiColors,
    });

    function onActivation(text: string) {
        (text: string) => activate(text, $currentCmdConfig?.activationOptions);
    }

    type Indexed = { line: string; index: number };

    let data: Indexed[] = processedOutput.map((line, index) => {
        return { line, index };
    });

    let vlist: VList<Indexed>;
    let selectedIndex = 0;

    // If list doesn't go back to 0 on new output
    // beforeUpdate(() => {
    //     selectedIndex = 0;
    // });

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

    $: hotKeysEnabled =
        $currentCmdConfig?.mode === "runOnKeystroke" ||
        ($currentCmdConfig?.mode === "runOnEnter" && $currentFocus === "tray");

    // When the tray is not focussed show a "ghost" version of the active highlight
    $: activeClass = $currentFocus === "tray" ? "bg-blue-300" : "bg-blue-100";
</script>

<svelte:body
    use:hotkeys={{
        handler(event) {
            if (event.key === "ArrowUp") {
                upDownListHandler(event, -1);
            } else if (event.key === "ArrowDown") {
                upDownListHandler(event, 1);
            } else if (event.key === "Enter") {
                onActivation?.(data[selectedIndex].line);
            }
        },
        keys: ["ArrowUp", "ArrowDown", "Enter"],
        enabled: hotKeysEnabled,
    }}
/>
