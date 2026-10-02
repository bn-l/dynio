<script lang="ts">
    import { onDestroy } from "svelte";
    import { hotkeys } from "$lib/actions/hotkeys.ts";
    import { scrollContainer } from "$lib/stores/globals.ts";

    export let padding = "p-4";
    export let scrollEl: HTMLElement | undefined = undefined;
    // Cmd/Ctrl+J/K scroll this panel. Lists turn it off because J/K move their selection instead.
    export let keyScroll = true;

    // About one list row, so J/K move through text at the same pace as through a list
    const keyScrollStep = 40;

    $: $scrollContainer = scrollEl ?? null;

    onDestroy(() => {
        $scrollContainer = null;
    });
</script>

<div class="h-full w-full flex flex-col">
    <div
        bind:this={scrollEl}
        class="flex-grow overflow-y-scroll overflow-x-hidden nice-scroll list-none {padding}"
    >
        <slot />
    </div>
</div>

<svelte:body
    use:hotkeys={{
        handler(event) {
            // Ctrl+K would delete the rest of the input line
            event.preventDefault();
            scrollEl?.scrollBy({ top: event.code === "KeyJ" ? keyScrollStep : -keyScrollStep, behavior: "instant" });
        },
        codes: ["KeyJ", "KeyK"],
        modifiers: ["CmdOrCtrl"],
        enabled: keyScroll,
    }}
/>
