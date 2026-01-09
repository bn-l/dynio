

<div class="px-2 pt-2 h-full">
    <div class="nice-scroll overflow-x-hidden overflow-y-auto h-full pb-2">
        {#each items as item, index (item.cmdName)}
            <div
                id={`cmdselect-item-${index}`}
                class="cmd-item list-item {index === selectedIndex ? 'item-selected' : 'item-hover'}"
                on:click={() => handleActivation(item.cmdName)}
            >
                <div class="list-item-inner cursor-pointer">
                    <!-- Header row -->
                    <div class="flex justify-between items-center mb-1">
                        <span class="cmd-name">{item.cmdName}</span>
                        {#if item.hotkeyNumber}
                            <span class="hotkey-badge">{keySymbols.cmd}+{item.hotkeyNumber}</span>
                        {/if}
                    </div>

                    <!-- Command -->
                    <div class="cmd-command">{item.command}</div>

                    <!-- Arguments -->
                    {#if item.arguments}
                        <div class="cmd-args">{item.arguments}</div>
                    {/if}

                    <!-- Meta row -->
                    <div class="cmd-meta">
                        <span class="meta-item">
                            <span class="meta-label">Mode:</span>
                            {capitaliseFirst(item.modeConfig?.mode)}
                        </span>
                        {#if item.modeConfig?.mode === "list" || item.modeConfig?.mode === "single"}
                        <span class="meta-item">
                            <span class="meta-label">Action:</span>
                            {capitaliseFirst(item.modeConfig.activationOptions?.activateAction)}
                        </span>
                        {/if}
                    </div>

                    <!-- Description -->
                    {#if item.description}
                        <div class="cmd-desc">{item.description}</div>
                    {/if}
                </div>
            </div>
        {/each}
    </div>
</div>

<script lang="ts">
    import { debounce } from "lodash-es";
    import { onDestroy, onMount } from "svelte";
    import { cmdConfig } from "$lib/stores/cmd-config.ts";
    import { currentCmd, query, stdout, currentTrayView, currentFocus, stdoutLock, statusBar, keySymbols } from "$lib/stores/globals.ts";
    import { hotkeys } from "$lib/actions/hotkeys.ts";
    import { invoke } from "@tauri-apps/api/core";

    console.log($cmdConfig);

    $: $statusBar = {
        actions: [{ key: "↵", label: "select" }],
        count: `${items.length} commands`
    };

    onDestroy(() => {
        $statusBar = { actions: [], count: "" };
    });

    // Sort by hotkey but don't change the order of an item if it has no hotkey
    $: commandList = Object.entries($cmdConfig).sort((a, b) => {
        const [_cmdNameA, configItemA] = a;
        const [_cmdNameB, configItemB] = b;
        if (
            "hotkeyNumber" in configItemA 
            && "hotkeyNumber" in configItemB
            && configItemA.hotkeyNumber
            && configItemB.hotkeyNumber
            && !Number.isNaN(configItemA.hotkeyNumber)
            && !Number.isNaN(configItemB.hotkeyNumber)
        ) {
            return configItemA.hotkeyNumber - configItemB.hotkeyNumber;
        }
        return 0;
    });

    $: items = commandList.map(([cmdName, config]) => {
        return {
            cmdName,
            ...config,
        };
    });

    const handleActivation = (key: string) => {
        $currentCmd = key; // NB: cmdNames are used as the keys
        $query = "";
        $stdout = [];
        $currentTrayView = "stdout";
        $currentFocus = "input";
        $stdoutLock = true;
        void invoke("stop_running");
    }

    function capitaliseFirst(string: string | undefined) {
        if (!string) return "undefined";
        return string.charAt(0).toUpperCase() + string.slice(1);
    }
    
    let selectedIndex: number | undefined = undefined;

    $: console.log("selectedIndex", selectedIndex);

    onMount(() => {
        const currentIndex = items.findIndex(item => item.cmdName === $currentCmd);
        selectedIndex = currentIndex !== -1 ? currentIndex : 0;
    });

    $: {
        if (selectedIndex !== undefined && items.length > 0) {
            const activeItemId = `cmdselect-item-${selectedIndex}`;
            const element = document.getElementById(activeItemId);
            if (element) {
                element.scrollIntoView({
                    behavior: 'instant',
                    block: 'nearest'
                });
            }
        }
    }

    $: if(selectedIndex !== undefined && items[selectedIndex]) {
        $currentCmd = items[selectedIndex].cmdName;
    };

    const upDownListHandler = debounce(
        (e: KeyboardEvent, indexChange: number) => {
            if(selectedIndex === undefined) return;
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

</script>

<svelte:body

    use:hotkeys={{
        handler(event) {
            if (event.key === "ArrowUp") {
                upDownListHandler(event, -1);
            } else if (event.key === "ArrowDown") {
                upDownListHandler(event, 1);
            } else if (event.key === "Enter" && selectedIndex !== undefined) {
                handleActivation(items[selectedIndex].cmdName);
            }
        },
        keys: ["ArrowUp", "ArrowDown", "Enter"],
        enabled: $currentTrayView === "cmdSelector",
    }}
    use:hotkeys={{
        handler() {
            if ($currentTrayView === "cmdSelector") {
                $currentTrayView = "stdout";
                $currentFocus = "input";
            }
            else {
                $currentTrayView = "cmdSelector";
            }
        },
        keys: ["s"],
        enabled: true,
        modifiers: ["Alt"]
    }}
/>
