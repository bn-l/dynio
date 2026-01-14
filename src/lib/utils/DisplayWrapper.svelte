<script lang="ts">
    import { onDestroy } from "svelte";
    import { scrollContainer } from "$lib/stores/globals.ts";

    export let padding = "p-4";
    export let scrollEl: HTMLElement | undefined = undefined;

    $: $scrollContainer = scrollEl ?? null;

    onDestroy(() => {
        $scrollContainer = null;
    });
</script>

<div class="h-full w-full flex flex-col">
    <div
        bind:this={scrollEl}
        class="flex-grow overflow-y-auto overflow-x-hidden nice-scroll list-none {padding}"
    >
        <slot />
    </div>
</div>