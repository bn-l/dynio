<script lang="ts">
    import { onDestroy } from "svelte";
    import { scrollContainer } from "$lib/stores/globals.ts";

    let scrollEl: HTMLElement;
    $: $scrollContainer = scrollEl;

    onDestroy(() => {
        $scrollContainer = null;
    });
</script>

<div
    class="h-79 mx-3"
>
    <div
        bind:this={scrollEl}
        class="nice-scroll h-full w-full overflow-x-hidden relative h-[97%]"
    >
        <div
            class="left-0 top-0 ml-3 w-145 absolute"
        >
            <slot />
        </div>
    </div>
</div>