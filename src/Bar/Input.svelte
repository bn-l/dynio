


<input
    id="cmdInput"
    tabIndex={0}
    class="text-3xl text-slate-900 placeholder:text-gray-400 w-[78%] h-full"
    placeholder="Input"
    autoComplete="off"
    spellCheck="false"
    autoFocus
    use:focusSync={"input"}
    bind:value={$query}
    on:keydown={(e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            $currentFocus = "tray";
        }
    }}
/>

<script lang="ts">
    import { focusSync } from "$lib/actions/focusSync.js";

    import { currentCmdConfig } from "$lib/stores/cmd-config.js";
    import { running, stdoutLock, stdout, exitCode, query, currentTrayView, currentFocus } from "$lib/stores/globals.js";
    import { invoke } from "@tauri-apps/api/tauri";
    import errors from "$lib/stores/errors.js";
    import { debounce } from "lodash-es";

    $: {
        if ($currentCmdConfig?.mode === "runOnKeystroke") {
            $query.trim().length === 0 && !$currentCmdConfig.runOnBlank ? 
                runProgram($query) : 
                debouncedRP($query);
        }
    }

    function runProgram(input: string) {

        if (!$currentCmdConfig) return;

        if (!input.trim() && !$currentCmdConfig.runOnBlank) {
            console.log("Input is empty, not running program.");
            void invoke("stop_running");
            $stdoutLock = true;
            $stdout = [];
            $exitCode = undefined;
            $running = false;
            return;
        }

        console.log("About to run program with: ", $currentCmdConfig.command, [...($currentCmdConfig.arguments ?? []), input].join(" "));

        invoke("run_program", {
            program: $currentCmdConfig.command,
            // The input is added as the last argument.
            arguments: [...($currentCmdConfig.arguments ?? []), input],
        })
        .then(() => {
            $running = true;
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