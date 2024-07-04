

{#if $settings.autoUpdate}
    <AutoUpdater />
{/if}


<div 
    id="app"
    class="h-screen w-screen flex flex-col justify-center items-center"
    on:mousedown={() => $clickInBounds = true}
    on:mouseup={() => $clickInBounds = false}
>
    <div
        id="mainWrapper"
        class="text-slate-900 rounded-md shadow-lg opacity-99 absolute top-4 left-3 right-4"
        style="background-color: var(--background);"
        style:--background={$settings.darkMode ? theme.backgroundDark: theme.backgroundLight}
    >
        <div
            id="inputWrapper"
            class="flex flex-row justify-start items-center gap-2.7 p-3.3 relative"
        >
            <LeftTile />
            <Input />
            <ErrorIndicator />
            <StderrIndicator />
            <DragSpot />

        </div>

        {#if $trayOpen}
            <Tray />
        {/if}
         
    </div>
</div>

<!-- 
To be done when moving to github:
Use tauri github action: https://tauri.app/v1/guides/building/cross-platform/#tauri-github-action
to generate JSON file: https://tauri.app/v1/guides/distribution/updater#static-json-file
expected by updater.

When this is in place, put updater settings in tauri.conf

-->

<!-- clear cargo.toml & package.json -->

<!-- Set unused imports / params in tsconfig as error  -->

<!-- Error indicators not shown if no error -->

<!-- Different styling on tile when currentTrayView = cmdSelector -->

<!-- Styling --> 
<!--    Styling list display: -->
<!--        - Long line should be able to wrap to x number of lines then be trunked (do this by checking the character width of the tray and dividing etc) -->


<script lang="ts">
    import "./assets/main.css";
    import "./assets/bar.css";
    import "virtual:uno.css";
    import theme from "$lib/theme.json"

    import { settings } from "$lib/stores/settings.js";
    import { fileHovering, trayOpen, running, stdoutLock, currentFocus, query, clickInBounds, stderr, currentTrayView, currentCmd, clearInput } from "$lib/stores/globals.js";
    import Tray from "./Tray/Tray.svelte";
    import Input from "./Bar/Input.svelte";
    import LeftTile from "./Bar/LeftTile.svelte";
    import ErrorIndicator from "./Bar/ErrorIndicator.svelte";
    import StderrIndicator from "./Bar/StderrIndicator.svelte";
    import DragSpot from "./Bar/DragSpot.svelte";
    import { loadValidateAndInitConfigStores } from "./lib/utils/config-file-utils.ts";
    import { onMount, afterUpdate, beforeUpdate } from 'svelte';
    import { listen } from "@tauri-apps/api/event";
    import type { Event } from "@tauri-apps/api/event";
    import { stdout } from "$lib/stores/globals.js";
    import { currentCmdConfig, cmdConfig } from "$lib/stores/cmd-config.ts";
    import { debounce } from "lodash-es";
    import { getCurrent } from "@tauri-apps/api/window"
    import { isRegistered, register, unregister } from "@tauri-apps/api/globalShortcut"
    import { invoke } from "@tauri-apps/api";
    import UncaughtErrors from "./Meta/UncaughtErrors.svelte";
    import AutoUpdater from "./Meta/AutoUpdater.svelte";
    import { errors } from "$lib/stores/errors.ts";
    import { hotkeys } from "$lib/actions/hotkeys.ts";
    import { tick } from "svelte";
    import { appWindow } from "@tauri-apps/api/window";
    import { watch } from "tauri-plugin-fs-watch-api";
    import type { UnlistenFn } from '@tauri-apps/api/event';
    import { relaunch } from '@tauri-apps/api/process';

    // ! Debug, delete
    $: console.log($query);

    onMount(async () => {
        await loadValidateAndInitConfigStores();
    });

    onMount(() => {
        const watcher = async (): Promise<UnlistenFn> => {
            const configDir = await invoke("get_config_dir") as string;
            const stopWatching = await watch(
                configDir,
                (event) => {
                    void relaunch();
                },
                { recursive: true },
            );
            return stopWatching;
        }
        const unwatchPromise = watcher();

        return () => { unwatchPromise.then(f => f()); }
    })

    // ----------------- Tray open / closed logic ----------------- //

    // Starts closed
    // Closes: upon hiding (done in event listener below)
    // Opens: whenever stdout is received (done in stdout listener below)

    // -------------- Backend Stdout Event Listener --------------- //

    // If running don't clear output. Set time out to clear it. else clear it.

    let timeout: number | NodeJS.Timeout = 0;
    let emptyStdCounter = 0;
    let clearInputTimeout: number | NodeJS.Timeout = 0;

    onMount(() => {
        const unlisten = listen("stdout", (e: Event<string[]>) => {
            $trayOpen = true;
            console.log("stdout event recived: ", e.payload)
            if($stdoutLock) return;

            clearTimeout(timeout);
            // Debounce if it will set stdout to [] to prevent output flashing.
            if(e.payload.length === 0) {
                emptyStdCounter += 1;
                // If 3 empties in a row, clear immediately.
                if(emptyStdCounter > 3) {
                    emptyStdCounter = 0;
                    $stdout = [];
                    return;
                }
                timeout = setTimeout(() => {
                    console.log("timer ran");
                    $stdout = [];
                }, 1000);
                return;
            }
            clearTimeout(timeout);
            emptyStdCounter = 0;

            console.log("setting stdout to value")
            $stdout = $currentCmdConfig?.outputOptions?.reverse ?
                e.payload.reverse() :
                e.payload;

        });
        return () => { void unlisten.then( f => f()) };
    }); 

    // -------------- Backend Stderr Event Listener --------------- //

    onMount(() => {
        const unlisten = listen("stderr", (e: Event<string[]>) => {
            console.log("stderr event received: ", e.payload);
            $stderr = e.payload;
        });
        return () => { void unlisten.then( f => f()) };
    }); 

    // ----------- Backend window hide Event Listener ------------- //

    onMount(() => {
        const unlisten = listen("main_hide_unhide", (e: Event<"hide" | "unhide">) => {

            console.log(e.payload);
            if(e.payload === "hide") {
                $currentTrayView = "stdout";
                clearInputTimeout = setTimeout(() => {
                    clearInput();
                }, 1000 * 60 * 10); // 10mins
            }
            if(e.payload === "hide" && $trayOpen && !$query && $stdout.length === 0) {
                $trayOpen = false;
            }
            if(e.payload === "unhide") {
                clearTimeout(clearInputTimeout);
            }
        });
        return () => { void unlisten.then( f => f()) };
    }); 


    // --------------- Backend exit Event Listener --------------- //

    const exitHandler = debounce(() => $running = false, 100);

    onMount(() => {
        const unlisten = listen("exit", (e: Event<number | undefined>) => {
            console.log("cmd exit code received: ", e.payload);
            exitHandler();
        });
        return () => { void unlisten.then( f => f()) };
    });

    // -------------------- Hotkey handlers --------------------- //

    function escapeKeyHandler() {
        if($currentTrayView !== "stdout") {
            $currentTrayView = "stdout";
        }
        else if($query.length > 0) {
            void tick().then(() => {
                clearInput();
            });
        }
        else {
            void invoke("hide_main");
        }
    }

    function cmdHotkeyHandler(event: KeyboardEvent) {
        Object.entries($cmdConfig).forEach(([cmdName, configItem]) => {
            if(configItem.hotkeyNumber !== undefined && 
                (Number(event.key) === configItem.hotkeyNumber)
            ) {
                clearInput();
                $currentCmd = cmdName
            }
        });
    }

    function tileHotkeyHandler() {
        if($currentTrayView === "cmdSelector") {
            $currentTrayView = "stdout";

        }
        else {
            clearInput();
            $trayOpen = true;
            $currentTrayView = "cmdSelector";
        }
    }

</script>


<svelte:body
    use:hotkeys={{
        handler: escapeKeyHandler,
        keys: ["Escape"],
        enabled:  true,
    }}
    use:hotkeys={{
        handler: cmdHotkeyHandler,
        keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
        modifiers: ["Alt"],
        enabled:  true,
    }}
    use:hotkeys={{
        handler: tileHotkeyHandler,
        keys: ["S"],
        modifiers: ["Alt"],
        enabled:  true,
    }}
/>

<svelte:window 
    on:keydown={(e) => {
        const ctrl = e.getModifierState("Control");
        const meta  = e.getModifierState("Meta");
        const ctrlOrCmd = ctrl || meta;
        const alt = e.getModifierState("Alt");
        const shift  = e.getModifierState("Shift");
        if (
            alt
            || alt && e.key === "Escape"
            || alt && e.key === "Space"
            || ctrlOrCmd && e.key === "u"
            || ctrlOrCmd && e.key === "p"
            || e.key === "F5"
        ) {
            console.log("preventing default");
            e.preventDefault();
        }
    }}
/>