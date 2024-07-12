
<ScrollablePanel>
    <div
        class="flex justify-between items-center"
    >
    <!-- Panel heading -->
        <div
            id="panelHeading"
            class="text-center text-lg py-3"
        >
            {panelHeading}
        </div>
        <button
            class="errorClearButton rounded-md"
            on:click={onClear}
        >
            clear all
        </button>
    </div>
    <!-- List items -->
    <div
        class=""
    >
        <slot />
    </div>
</ScrollablePanel>

<script lang="ts">

    import ScrollablePanel from "$lib/utils/ScrollablePanel.svelte";

    export let onClear: () => void = () => {};
    export let panelHeading: string = "";


</script>
