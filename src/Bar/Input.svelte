

<div>
    <div
        id="leftDecoration"
        class=""
    >
        
    </div>
    <input
        id="cmdInput"
        class="w-120 h-full ml--3"
        style={fontSizeString}
        placeholder={$currentCmdConfig?.placeholderText}
        autoComplete="off"
        spellCheck="false"
        use:inputFocusAction
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
    import { currentCmdConfig } from "$lib/stores/cmd-config.js";
    import { running, stdoutLock, stdout, exitCode, query, currentTrayView, stderr } from "$lib/stores/globals.js";
    import { settings } from "$lib/stores/settings.ts";
    import { invoke } from "@tauri-apps/api/tauri";
    import { errors } from "$lib/stores/errors.js";
    import { debounce } from "lodash-es";
    import { inputFocusAction } from "./InputFocusAction.ts";

    $: fontSizeString = "font-size: " + ($settings.inputFontSize ?? 1.8.toString()) + "rem";
    
    function runProgram(input: string) {

        if (!$currentCmdConfig) return;

        if (!input.trim()) {
            console.log("Input is empty, not running program.");
            void invoke("stop_running");
            $stdoutLock = true;
            $exitCode = undefined;
            $running = false;
            $stdout = [];
            $stderr = [];
            return;
        }

        $running = true;
        $stdoutLock = false;

        console.log("About to run program with: ", $currentCmdConfig.command, $currentCmdConfig.currentDir, [...($currentCmdConfig.arguments ?? []), input].join(" "));

        invoke("run_program", {
            program: $currentCmdConfig.command,
            current_dir: $currentCmdConfig.currentDir,
            // The input is added as the last argument.
            arguments: [...($currentCmdConfig.arguments ?? [])],
            input,
        })
        .then(() => {
            $currentTrayView = "stdout";
            console.log("Program invoked successfully (need to listen for output).");
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