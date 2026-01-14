
<div class="grid">
    {#key clampedCmdName}
        <button
            transition:blur={{duration: 200}}
            id="leftTile"
            class="[grid-area:1/1] w-20 select-none flex items-center justify-center px-2.5 py-1.5 cursor-pointer outline-none"
            on:click={
                () => {
                    if ($currentTrayView === "cmdSelector") {
                        $currentTrayView = "stdout";
                        $currentFocus = "input";
                        $trayOpen = true;
                    }
                    else {
                        $currentTrayView = "cmdSelector";
                        $trayOpen = true;
                    }
                }
            }
        >
            <span>{clampedCmdName}</span>
        </button>
    {/key}
</div>

<script lang="ts">
    import { currentTrayView, currentFocus, currentCmd, trayOpen } from "$lib/stores/globals.js";
    import { blur } from 'svelte/transition';

    $: clampedCmdName = $currentCmd && $currentCmd?.length > 10 ? 
        $currentCmd.slice(0, 7).trim() + "..." : 
        $currentCmd ?? "-----";
</script>