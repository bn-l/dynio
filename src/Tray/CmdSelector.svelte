

<!-- Container for top and bottom row -->
<VList {data} let:item class="nice-scroll" {getKey} bind:this={vlist}>
    <div
        class={`${item.index === selectedIndex ? activeClass : ""}`}
        on:mouseenter={() => selectedIndex = item.index}
        on:click={() => handleActivation(data[selectedIndex].id)}
    >
        <!-- Top -->    
        <div
            class=""
        >
            <!-- id = command name -->
            <div
                class=""
            >
                {item.id}
            </div>
                <!-- Test commands with and without hotkeys -->
                <!-- This should take up space regardless -->
                <div
                    class=""
                >
                    {item.config.hotkeyNumber ?? ""}
                </div>
        </div>
        <!-- Middle -->
        <div
            class=""
        >
            <div
                class=""
            >
                {item.config.command}
            </div>
            <div
                class=""
            >
                {item.config.arguments}
            </div>
            <div
                class=""
            >
                <div
                    class=""
                >
                    Display as:
                </div>
                <div
                    class=""
                >
                    {item.config.outputOptions?.display?.type || "List"}
                </div>
            </div>
            <div
                class=""
            >
                <div
                    class=""
                >
                    On activation:
                </div>
                <div
                    class=""
                >
                    {item.config.activationOptions?.activateAction || "Copy"}
                </div>
            </div>
        </div>
        <!-- Bottom -->
        <div
        class=""
        >
            <div
                class=""
            >
                {item.config.description}
            </div>
        </div>
    </div>
</VList>

<script lang="ts">
    import { debounce } from "lodash-es";
    import { VList } from "virtua/svelte";
    import { cmdConfig, currentCmdConfig } from "$lib/stores/cmd-config.ts";
    import { currentCmd, query, stdout, currentTrayView, currentFocus, stdoutLock } from "$lib/stores/globals.ts";
    import { hotkeys } from "$lib/actions/hotkeys.ts";
    import { invoke } from "@tauri-apps/api";
    import type { CmdConfigItem } from "$lib/stores/schema/cmd-config-schema.ts";


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

    type commandListData = { id: string, config: CmdConfigItem, index: number };
    $: data = commandList.map(([cmdName, config], index) => {
        return {
            id: cmdName,
            config,
            index
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

    const getKey = (item: commandListData) => item.id;


    let vlist: VList<commandListData>;
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
                handleActivation(data[selectedIndex].id);
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
