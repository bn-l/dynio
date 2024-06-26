
<div 
    id="app"
    class="h-screen w-screen flex flex-col justify-center items-center"
>
    {#if $fileHovering}
        <Hover />
    {/if}

    <div
        id="mainWrapper"
        class="text-slate-900 rounded-md shadow-lg opacity-99 absolute top-4 left-3 right-4"
        style="background-color: var(--background);"
        style:--background={$settings.darkMode ? theme.backgroundDark: theme.backgroundLight}
        on:blur={() => {
            if ($settings.hideOnLostFocus) {
                void hideWindow();
            }
        }}  
    >
        <div
            id="inputWrapper"
            class="flex flex-row justify-start items-center gap-2.7 p-3.3 relative"
        >
            <LeftTile />
            <Input />
            <ErrorIndicator />
            <DragSpot />

        </div>

        {#if $trayOpen}
            <Tray> 
                <slot /> 
            </Tray>
        {/if}
         
    </div>
</div>

<!-- Regenerate types and schemas -->

<script lang="ts">
    import "./assets/main.css";
    import "./assets/scroll-area.css";
    import "./assets/bar.css";
    import "virtual:uno.css";
    import theme from "$lib/theme.json"

    import { settings } from "$lib/stores/settings.js";
    import { fileHovering, trayOpen, currentCmd } from "$lib/stores/globals.js";
    import Tray from "$lib/Tray/Tray.svelte";
    import Hover from "$lib/Meta/Hover.svelte";
    import Input from "$lib/Bar/Input.svelte";
    import LeftTile from "$lib/Bar/LeftTile.svelte";
    import ErrorIndicator from "$lib/Bar/ErrorIndicator.svelte";
    import DragSpot from "$lib/Bar/DragSpot.svelte";
    import { loadValidateAndInitConfigStores } from "./lib/utils/config-file-utils.ts";
    import { onMount } from 'svelte';

    onMount(async () => {
        await loadValidateAndInitConfigStores();
    });

    console.log("rendered");

    async function hideWindow() {
        // NB: this is also called in Bar
        console.log("hideWindow called, still to be implemented");
    }
</script>
