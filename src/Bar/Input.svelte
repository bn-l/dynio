


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
    on:input={(e) => {
        debouncedRP($query);
    }}
/>

<script lang="ts">
    import { focusSync } from "$lib/actions/focusSync.js";

    import { currentCmdConfig } from "$lib/stores/cmd-config.js";
    import { running, stdoutLock, stdout, exitCode, query, currentTrayView, currentFocus } from "$lib/stores/globals.js";
    import { invoke } from "@tauri-apps/api/tauri";
    import errors from "$lib/stores/errors.js";
    import { debounce } from "lodash-es";

    
    function runProgram(input: string) {

        if (!$currentCmdConfig) return;

        if (!input.trim()) {
            console.log("Input is empty, not running program.");
            void invoke("stop_running");
            $stdoutLock = true;
            $exitCode = undefined;
            $running = false;
            $stdout = [];
            return;
        }

        // $stdout = [];
        $running = true;
        $stdoutLock = false;

        console.log("About to run program with: ", $currentCmdConfig.command, [...($currentCmdConfig.arguments ?? []), input].join(" "));

        invoke("run_program", {
            program: $currentCmdConfig.command,
            // The input is added as the last argument.
            arguments: [...($currentCmdConfig.arguments ?? []), input],
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