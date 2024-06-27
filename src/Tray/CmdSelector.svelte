

<!-- Container for top and bottom row -->
{#each commandList as [cmdName, config] (cmdName)}
    <div
        class=""
    >
        <!-- Top -->    
        <div
            class=""
        >
            <div
                class=""
            >
                {cmdName}
            </div>
                <!-- Test commands with and without hotkeys -->
                <!-- This should take up space regardless -->
                <div
                    class=""
                >
                    {config.hotkeyNumber ?? ""}
                </div>
        </div>
        <!-- Middle -->
        <div
            class=""
        >
            <div
                class=""
            >
                {config.command}
            </div>
            <div
                class=""
            >
                {config.arguments}
            </div>
            <div
                class=""
            >
                <div
                    class=""
                >
                    Runs on:
                </div>
                <div
                    class=""
                >
                    {config.mode === "runOnEnter" ? "Enter" : "Key stroke"}
                </div>
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
                    {config.outputOptions?.display?.type || "List"}
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
                    {config.activationOptions?.activateAction || "Copy"}
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
                {config.description}
            </div>
        </div>
    </div>
{/each}

<script lang="ts">

    import { cmdConfig, currentCmdConfig } from "$lib/stores/cmd-config.ts";
    import { currentCmd, query, stdout, currentTrayView, currentFocus, stdoutLock } from "$lib/stores/globals.ts";
    import { hotkeys } from "$lib/actions/hotkeys.ts";
    import { invoke } from "@tauri-apps/api";


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

    const handleActivation = (key: string) => {
        $currentCmd = key; // NB: cmdNames are used as the keys
        $query = "";
        $stdout = [];
        $currentTrayView = "stdout";
        $currentFocus = "input";
        $stdoutLock = true;
        void invoke("stop_running");
    }

</script>

<svelte:body
    use:hotkeys={{
        handler() {
            if ($currentTrayView === "cmdSelector") {
                $currentTrayView = "stdout";
                $currentFocus = "input";
            }
            else {
                $currentTrayView = "cmdSelector";
                $currentFocus = "tray";
            }
        },
        keys: ["s"],
        enabled: true,
        modifiers: ["Alt"]
    }}
/>
