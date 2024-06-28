

<!-- !!!

    Transfer delay in clearing stdout logic to store like in original project 

-->

{#if $stdoutLock}
    <EmptyDisplay message="" />

{:else if $stdout.length === 0 && $running}
    <EmptyDisplay message="" />

{:else if $stdout.length === 0 && !$running}
    <EmptyDisplay message="No output" />

{:else if displayType === "single"}
    <SingleDisplay />

{:else if displayType === "list"}
    <ListDisplay />

{:else}
    <EmptyDisplay />
    
{/if}

<script lang="ts">
    import { stdout, stdoutLock, running, exitCode, query } from "$lib/stores/globals.ts";
    import { currentCmdConfig } from "$lib/stores/cmd-config.ts";
    import type { SvelteComponent } from "svelte";
    
    import SingleDisplay from "./SingleDisplay.svelte";
    import ListDisplay from "./ListDisplay/ListDisplay.svelte";
    import EmptyDisplay from "./EmptyDisplay.svelte";

    $: displayType = $currentCmdConfig?.outputOptions?.display?.type;

    $: console.log("in stdout.svelte", "stdoutLock", $stdoutLock, "stdout.length", $stdout.length, "running", $running)

    // $: console.log("$stdout.length === 0 ", $stdout.length === 0, "!$stdoutLock && $query.trim().length > 0 ", !$stdoutLock && $query.trim().length > 0, "!$stdoutLock ", !$stdoutLock, "!$running ", !$running);

</script>
