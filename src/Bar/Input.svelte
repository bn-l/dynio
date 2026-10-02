

<div class="flex items-center gap-3">
    <div
        id="leftDecoration"
        class="flex items-center"
        aria-hidden="true"
    >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 5.5 15.5 12 9 18.5" />
        </svg>
    </div>
    <input
        id="cmdInput"
        class="flex-1 min-w-0 h-full"
        style={fontSizeString}
        placeholder={$currentCmdConfig?.placeholderText}
        autoComplete="off"
        spellCheck="false"
        use:inputFocusAction
        bind:this={inputEl}
        bind:value={$query}
        on:input={() => {
            if(!$currentCmdConfig?.runOnEnter) {
                debouncedRP($query);
            }
        }}
        on:keydown={(event) => {
            if(
                $currentCmdConfig?.runOnEnter 
                && event.key === "Enter"
            ) {
                debouncedRP($query);
            }
        }}
    />
</div>

<script lang="ts">
    import { onMount } from "svelte";
    import { currentCmdConfig } from "$lib/stores/cmd-config.js";
    import { running, stdoutLock, stdout, exitCode, query, currentTrayView, stderr, fileHovering } from "$lib/stores/globals.js";
    import { settings } from "$lib/stores/settings.ts";
    import { invoke } from "@tauri-apps/api/core";
    import { getCurrentWebview } from "@tauri-apps/api/webview";
    import { errors } from "$lib/stores/errors.js";
    import { debounce } from "lodash-es";
    import { inputFocusAction } from "./InputFocusAction.ts";

    let inputEl: HTMLInputElement;

    $: fontSizeString = "font-size: " + ($settings.inputFontSize ?? 1.5.toString()) + "rem";

    /**
     * Puts the path of a file dropped on the window into the input at the caret (replacing any
     * selected text), the way a terminal does. No quoting is needed: the whole input reaches the
     * command as one argument. Setting the value from code doesn't fire `on:input`, so commands
     * that run as you type are run here.
     */
    function insertDroppedPath(path: string) {
        const end = inputEl.value.length;
        inputEl.setRangeText(path, inputEl.selectionStart ?? end, inputEl.selectionEnd ?? end, "end");
        $query = inputEl.value;
        // Focusing scrolls a long path so the caret shows. The input usually has focus already,
        // and focusing it again does nothing, so it's blurred first.
        inputEl.blur();
        inputEl.focus();
        if (!$currentCmdConfig?.runOnEnter) debouncedRP($query);
    }

    // Only the first dropped file is used, since the input is a single argument.
    onMount(() => {
        const unlisten = getCurrentWebview().onDragDropEvent(({ payload }) => {
            switch (payload.type) {
                case "enter":
                    $fileHovering = payload.paths.length > 0;
                    break;
                case "drop":
                    $fileHovering = false;
                    if (payload.paths[0]) insertDroppedPath(payload.paths[0]);
                    break;
                case "leave":
                    $fileHovering = false;
                    break;
            }
        });
        return () => { void unlisten.then(f => f()); };
    });

    function runProgram(input: string) {

        if (!$currentCmdConfig) return;

        if (!input.trim()) {
            console.debug("Input is empty, not running program.");
            void invoke("stop_running");
            $stdoutLock = true;
            $exitCode = undefined;
            $running = false;
            $stdout = [];
            $stderr = "";
            return;
        }

        console.debug("[DEBUG] Input.svelte: SETTING $running = true");
        $running = true;
        $stdoutLock = false;

        console.debug("About to run program with: ", $currentCmdConfig.command, $currentCmdConfig.currentDir, [...($currentCmdConfig.arguments ?? []), input].join(" "));

        invoke("run_program", {
            program: $currentCmdConfig.command,
            current_dir: $currentCmdConfig.currentDir,
            // The input is added as the last argument.
            arguments: [...($currentCmdConfig.arguments ?? [])],
            input,
            streaming: $currentCmdConfig.modeConfig.mode === "llm",
        })
        .then(() => {
            $currentTrayView = "stdout";
            console.debug("Program invoked successfully (need to listen for output).");
        })
        .catch(err => {
            if(err instanceof Error) {
                errors.addError(err.message + err.stack, "unknown");
            } else if(typeof err === "string") {
                errors.addError(err, "tauri");
                
            } else {
                errors.addError(JSON.stringify(err), "unknown");
            }
        })
    }
        // Debounce is preventing a held backspace from clearing?

    const debouncedRP = debounce((input: string) => runProgram(input), 30);

</script>