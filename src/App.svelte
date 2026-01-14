
<!-- Using built-in dialog. See:
https://tauri.app/v1/guides/distribution/updater/#built-in-dialog
-->
<!-- {#if $settings.autoUpdate}
    <AutoUpdater />
{/if} -->


<div 
    id="app"
    class="h-screen w-screen flex flex-col justify-center items-center"
    on:mousedown={() => $clickInBounds = true}
    on:mouseup={() => $clickInBounds = false}
>
    <div
        id="mainWrapper"
        class="rounded-xl absolute top-4 left-3 right-4"
    >
        <div
            id="inputWrapper"
            class="grid grid-cols-[1fr_auto] items-center gap-2.7 p-3.3 relative my-0.5 pr-5 pl-6"
        >
            <Input />
            <LeftTile />
            <DragSpot />
        </div>

        {#if $trayOpen}
            <div id="divider"></div>
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

<!-- Errors: -->
<!-- Keywords seprated by a space in a path in an everything search are like they're wrapped in quotation marks so search is done on both together rather than separately leading to different results vs CLI -->
<!-- Quoted words in groq or openai will cause an error -->
<!-- Can all commands just be run in an impromptu batch file for windows? -->
<!-- would sending the commands to powershell help? -->

<!-- !!! RENAME TO LANTERN !!! -->
<!-- make graphic a stylised lantern -->


<!-- Future: --> 
<!-- Can set timer using cli timer -->
<!-- Drag and drop should put path in input (then can grep that path) -->
<!-- Make parse option an enum of text, ansi, markdown, html -->
<!-- Can take cmd args to launch a filterer with the stdin supplied to it (and it treats this
as regular stdout from commands) -->
<!-- Convert ListDisplay list to generic component then use in CmdSelector, Stderr, ErrorList, (so error messages can be navigated and selected) -->
<!-- Tray expands to max height but can contract to any min -->
<!-- Test autoupdates -->
<!-- Separate stdout for each command. It shouldn't disappear when changing commands. -->
<!-- Runnning indicator with command cancel button -->
<!-- Implement time out on a running command with new EmptyDisplay message "Timed out" -->
<!-- shortcut to reselect input in singledisplay mode -->
<!-- In addition to grab handle, make input grow as text increases and make backing div a grab handle also -->
<!-- Window position remembering -->



<script lang="ts">
    import "./assets/main.css";
    import "virtual:uno.css";
    
    // import { settings } from "$lib/stores/settings.js";
    // import AutoUpdater from "./Meta/AutoUpdater.svelte";
    import { trayOpen, running, stdoutLock, query, clickInBounds, stderr, currentTrayView, currentCmd, clearInput, isMac, statusBar, scrollContainer } from "$lib/stores/globals.js";
    import { errors } from "$lib/stores/errors.ts";
    import Tray from "./Tray/Tray.svelte";
    import Input from "./Bar/Input.svelte";
    import LeftTile from "./Bar/LeftTile.svelte";
    import DragSpot from "./Bar/DragSpot.svelte";
    import { loadValidateAndInitConfigStores } from "./lib/utils/config-file-utils.ts";
    import { onMount } from 'svelte';
    import { listen } from "@tauri-apps/api/event";
    import type { Event } from "@tauri-apps/api/event";
    import { stdout } from "$lib/stores/globals.js";
    import { currentCmdConfig, cmdConfig } from "$lib/stores/cmd-config.ts";
    import { debounce } from "lodash-es";
    import { invoke } from "@tauri-apps/api/core";
    import { hotkeys } from "$lib/actions/hotkeys.ts";
    import { tick } from "svelte";
    import { openUrl } from "@tauri-apps/plugin-opener";

    onMount(async () => {
        await loadValidateAndInitConfigStores();
    });


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
                    $stdout = [];
                },  $currentCmdConfig?.noOutputTimeoutMs ?? 800);
                return;
            }
            clearTimeout(timeout);
            emptyStdCounter = 0;

            $stdout = $currentCmdConfig?.modeConfig?.displayOptions?.reverse ?
                e.payload.reverse() :
                e.payload;

        });
        return () => { void unlisten.then( f => f()) };
    }); 

    // -------------- Backend Stderr Event Listener --------------- //

    onMount(() => {
        const unlisten = listen("stderr", (e: Event<string[]>) => {
            const filterPattern = $currentCmdConfig?.modeConfig?.displayOptions?.stderrFilterRegex;
            let lines = e.payload;
            if (filterPattern) {
                const regex = new RegExp(filterPattern);
                lines = lines.filter(line => !regex.test(line));
            }
            const stderrText = lines.join("\n").trim();
            $stderr = stderrText;
            if (stderrText.length > 0) {
                $trayOpen = true;
            }
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
                document.getElementById("cmdInput")?.focus();
            }
        });
        return () => { void unlisten.then( f => f()) };
    }); 


    // --------------- Backend exit Event Listener --------------- //

    const exitHandler = debounce(() => {
        console.log("[DEBUG] exitHandler EXECUTING, setting $running = false");
        $running = false;
    }, 100);

    onMount(() => {
        const unlisten = listen("exit", (e: Event<number | undefined>) => {
            console.log("[DEBUG] exit event received, code:", e.payload, "current $running:", $running);
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
                $currentCmd = cmdName;
                $currentTrayView = "stdout";
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

    function externalLinkHandler(event: MouseEvent) {
        const anchor = (event.target as Element).closest("a");
        if (!anchor) return;
        const href = anchor.getAttribute("href");
        if (!href) return;
        if (href.startsWith("http://") || href.startsWith("https://")) {
            event.preventDefault();
            void openUrl(href);
        }
    }

    // Hacky instead of having an event system when events happen (like changing cmd)
    $: {
        $currentCmd,
        document.getElementById("cmdInput")?.focus();
    }

    // Open tray when new errors arrive (badge will be visible)
    let prevErrorsLen = 0;
    $: {
        if ($errors.length > prevErrorsLen) {
            $trayOpen = true;
        }
        prevErrorsLen = $errors.length;
    }

    // Status bar hints based on current view and running state
    // When $stdout has content, display components (ListDisplay, SingleDisplay) manage their own status bar
    $: {
        console.log("[DEBUG] App.svelte statusBar reactive: view=", $currentTrayView, "stdout.length=", $stdout.length, "query.length=", $query.length);
        if ($currentTrayView === "stderr" || $currentTrayView === "errors") {
            console.log("[DEBUG] App.svelte: SETTING 'esc go back'");
            $statusBar = { actions: [{ key: "esc", label: "go back" }], count: "" };
        } else if ($currentTrayView === "stdout" && $stdout.length === 0) {
            if ($query.length > 0) {
                console.log("[DEBUG] App.svelte: SETTING 'esc to clear'");
                $statusBar = { actions: [{ key: "esc", label: "to clear" }], count: "" };
            } else {
                console.log("[DEBUG] App.svelte: SETTING 'esc to hide'");
                $statusBar = { actions: [{ key: "esc", label: "to hide" }], count: "" };
            }
        } else {
            console.log("[DEBUG] App.svelte: NOT setting statusBar (display component handles it)");
        }
    }

    // ------------------- Half-page scrolling ------------------- //

    function halfPageScroll(direction: 1 | -1) {
        if (!$scrollContainer) return;
        $scrollContainer.scrollBy({
            top: direction * ($scrollContainer.clientHeight / 2),
            behavior: 'smooth'
        });
    }

</script>


<svelte:body
    on:click={externalLinkHandler}
    use:hotkeys={{
        handler: escapeKeyHandler,
        keys: ["Escape"],
        enabled:  true,
    }}
    use:hotkeys={{
        handler: cmdHotkeyHandler,
        keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
        modifiers: isMac ? ["Meta"] : ["Control"],
        enabled:  true,
    }}
    use:hotkeys={{
        handler: tileHotkeyHandler,
        keys: ["S"],
        modifiers: isMac ? ["Meta"] : ["Control"],
        enabled:  true,
    }}
/>

<svelte:window
    on:keydown={(e) => {
        const ctrl = e.getModifierState("Control");
        const meta  = e.getModifierState("Meta");
        const ctrlOrCmd = ctrl || meta;
        const alt = e.getModifierState("Alt");

        // Half-page scrolling with Ctrl+U/D (use event.code because on macOS
        // Ctrl+letter in inputs produces control characters for event.key)
        if (ctrl && $trayOpen && (e.code === "KeyU" || e.code === "KeyD")) {
            e.preventDefault();
            halfPageScroll(e.code === "KeyU" ? -1 : 1);
            return;
        }

        // Overriding webview hotkeys (use e.code for letters because on macOS
        // Ctrl+letter in inputs produces control characters for e.key)
        if (
            alt && e.key === "Escape"
            || alt && e.key === " "
            || ctrlOrCmd && e.code === "KeyU"
            || ctrlOrCmd && e.code === "KeyD"
            || ctrlOrCmd && e.code === "KeyP"
            || ctrlOrCmd && e.code === "KeyR"
            || ctrlOrCmd && e.code === "KeyJ"
            || ctrlOrCmd && e.code === "KeyF"
            || e.key === "F5"
        ) {
            console.log("preventing default");
            e.preventDefault();
        }
    }}
/>