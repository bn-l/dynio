
<svelte:window  
    on:error|capture={(event) => { uncaughtErrorHandler(event)} }
/>

{#if $settings.autoUpdate}
    <AutoUpdater />
{/if}
    
{#if uncaughtError !== undefined}
    <UncaughtErrors error={uncaughtError} />
{/if}

<div 
    id="app"
    class="h-screen w-screen flex flex-col justify-center items-center"
    on:mousedown={() => $clickInBounds = true}
    on:mouseup={() => $clickInBounds = false}
    on:keydown={(e) => {
        if (e.key === "Alt") {
            e.preventDefault();
        }
    }}
>
    {#if $fileHovering}
        <Hover />
    {/if}

    <div
        id="mainWrapper"
        class="text-slate-900 rounded-md shadow-lg opacity-99 absolute top-4 left-3 right-4"
        style="background-color: var(--background);"
        style:--background={$settings.darkMode ? theme.backgroundDark: theme.backgroundLight}
        on:blur={() => {
            if ($settings.hideOnLostFocus) {
                void hideWindow();
            }
        }}  
    >
        <div
            id="inputWrapper"
            class="flex flex-row justify-start items-center gap-2.7 p-3.3 relative"
        >
            <LeftTile />
            <Input />
            <ErrorIndicator />
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

<!-- Hover works properly -->

<!-- Hot keys work properly -->

<!-- Error display system ( jiggle error symbol and/or change size / contrast ) -->


<script lang="ts">
    import "./assets/main.css";
    import "./assets/bar.css";
    import "virtual:uno.css";
    import theme from "$lib/theme.json"

    import { settings } from "$lib/stores/settings.js";
    import { fileHovering, trayOpen, running, stdoutLock, currentFocus, query, clickInBounds } from "$lib/stores/globals.js";
    import Tray from "./Tray/Tray.svelte";
    import Hover from "./Meta/Hover.svelte";
    import Input from "./Bar/Input.svelte";
    import LeftTile from "./Bar/LeftTile.svelte";
    import ErrorIndicator from "./Bar/ErrorIndicator.svelte";
    import DragSpot from "./Bar/DragSpot.svelte";
    import { loadValidateAndInitConfigStores } from "./lib/utils/config-file-utils.ts";
    import { onMount, afterUpdate, beforeUpdate } from 'svelte';
    import { listen } from "@tauri-apps/api/event";
    import type { Event } from "@tauri-apps/api/event";
    import { stdout } from "$lib/stores/globals.js";
    import { currentCmdConfig } from "$lib/stores/cmd-config.ts";
    import { debounce } from "lodash-es";
    import { getCurrent } from "@tauri-apps/api/window"
    import { isRegistered, register, unregister } from "@tauri-apps/api/globalShortcut"
    import { invoke } from "@tauri-apps/api";
    import UncaughtErrors from "./Meta/UncaughtErrors.svelte";
    import AutoUpdater from "./Meta/AutoUpdater.svelte";

    onMount(async () => {
        await loadValidateAndInitConfigStores();
    });

    console.log("rendered");

    console.log($trayOpen);

    async function hideWindow() {
        // NB: this is also called in Bar
        console.log("hideWindow called in App.tsx, still to be implemented");
    }


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


    // ----------- Backend window hide Event Listener ------------- //

    onMount(() => {
        const unlisten = listen("main_hide_unhide", (e: Event<"hide" | "unhide">) => {

            console.log(e.payload);
            if(e.payload === "hide") {
                clearInputTimeout = setTimeout(() => {
                    $query = "";
                    $trayOpen = false;
                    $stdout = [];
                    $stdoutLock = true;
                }, 1000 * 60 * 10); // 10mins
            }
            if(e.payload === "hide" && $trayOpen && !$query && $stdout.length === 0) {
                $trayOpen = false;
            }
            if(e.payload === "unhide") {
                console.log("unhide event received on FE");
            }
        });
        return () => { void unlisten.then( f => f()) };
    }); 

    // --------------- Backend exit Event Listener --------------- //

    const exitHandler = debounce(() => $running = false, 100);

    onMount(() => {
        const unlisten = listen("exit", (e: Event<number | undefined>) => {
            console.log("exit event received: ", e.payload);
            exitHandler();
        });
        return () => { void unlisten.then( f => f()) };
    });

    let uncaughtError: Error | undefined;
    function uncaughtErrorHandler(event: any) {
        uncaughtError = (event as ErrorEvent).error;
        $trayOpen = true;
    }

</script>
