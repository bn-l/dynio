

<div
    class="px-3"
>   
    <div
        class="nice-scroll overflow-x-hidden h-79"
    >
    {#each items as item, index (item.cmdName)}
        <div
            id={`cmdselect-item-${index}`}
            class={`${index === selectedIndex ? "bg-orange-200" : "hover:bg-orange-100 m-0 p-0"} p-3 cursor-pointer`}
            on:click={() => handleActivation(item.cmdName)}
        >
            <!-- Line 1 -->    
            <div
                class="flex justify-between"
            >
                <div
                    class="text-xl pb-2"
                >
                    {item.cmdName}
                </div>
                    <!-- Test commands with and without hotkeys -->
                    <!-- This should take up space regardless -->
                    <div
                        class=""
                    >
                        {item.hotkeyNumber ? `Hotkey: ${item.hotkeyNumber}` : ""}
                    </div>
            </div>
            <!-- Line 2 --> 
            <div
                class="text-sm"
            >
                <div
                    class=""
                >
                    {item.command}
                </div>
            </div>
            <!-- Line 3 -->
            {#if item.arguments !== undefined}
                <div
                    class="flex text-sm"
                >
                    <div
                        class="flex"
                    >
                        <div
                            class="mr-2"
                        >
                        </div>
                        <div
                            class=""
                        >
                            {item.arguments}
                        </div>
                    </div>
                </div>
            {/if}
            <!-- Line 4 -->
            <div
                class="flex text-sm"
            >
                <div
                    class="flex"
                >
                    <div
                        class="mr-2"
                    >
                        Display as:
                    </div>
                    <div
                        class=""
                    >
                        {capitaliseFirst(item.outputOptions?.display?.type)}
                    </div>
                </div>
                <div
                    class="flex ml-6 "
                >
                    <div
                        class="mr-2"
                    >
                        On activation:
                    </div>
                    <div
                        class=""
                    >
                        {capitaliseFirst(item.activationOptions?.activateAction)}
                    </div>
                </div>
            </div>
            <!-- Bottom -->
            <div
            class="text-sm"
            >
                <div
                    class="mt-1"
                >
                    {item.description}
                </div>
            </div>
        </div>
    {/each}
    </div>
</div>

<script lang="ts">
    import { debounce } from "lodash-es";
    import { cmdConfig } from "$lib/stores/cmd-config.ts";
    import { currentCmd, query, stdout, currentTrayView, currentFocus, stdoutLock } from "$lib/stores/globals.ts";
    import { hotkeys } from "$lib/actions/hotkeys.ts";
    import { invoke } from "@tauri-apps/api";
    import { onMount } from "svelte";

    console.log($cmdConfig);

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
