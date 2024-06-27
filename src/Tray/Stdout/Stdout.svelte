

<!-- !!!

    Transfer delay in clearing stdout logic to store like in original project 

-->



<script lang="ts">
    import { stdout, stdoutLock, running, exitCode } from "$lib/stores/globals.ts";
    import { onMount } from "svelte";
    import { listen } from "@tauri-apps/api/event";
    import { currentCmdConfig } from "$lib/stores/cmd-config.ts";
    import type { Event } from "@tauri-apps/api/event";
    import type { Display } from "$lib/stores/schema/cmd-config-schema.ts";
    import type { SvelteComponent } from "svelte";
    
    import SingleDisplay from "./SingleDisplay.svelte";
    import ListDisplay from "./ListDisplay/ListDisplay.svelte";
    import EmptyDisplay from "./EmptyDisplay.svelte";

    // -------------- Backend Stdout Event Listener --------------- //

    // If running don't clear output. Set time out to clear it. else clear it.

    onMount(() => {
        const unlisten = listen("stdout", (e: Event<string[]>) => {
            $stdout = e.payload;
        });
        return () => { void unlisten.then( f => f()) };
    }); 

    // Component with any props
    let currentDisplay: {component: new (...args: any[]) => SvelteComponent, props: any} = {
        component: EmptyDisplay,
        props: {}
    };

    $: displayType = $currentCmdConfig?.outputOptions?.display?.type;

    $: {
        if($stdoutLock) {
            currentDisplay = { component: EmptyDisplay, props: {} }
        }
        else if ($stdout.length === 0) {
            currentDisplay = { component: EmptyDisplay, props: {"message": "No output"} }
        }
        else if (displayType === "single") {
            currentDisplay = { component: SingleDisplay, props: {} }
        }
        else if (displayType === "list") {
            currentDisplay = { component: ListDisplay, props: {} }
        }
        else {
            currentDisplay = { component: EmptyDisplay, props: {} }
        }
    }

</script>

<svelte:component this={currentDisplay.component} {...currentDisplay.props} />
