
{#key clampedCmdName}
    <button
        transition:blur={{duration: 200}}
        id="leftTile"
        class="select-none flex items-center justify-center px-2.5 py-1.5 cursor-pointer absolute outline-none"
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
        <!-- <svg
            class="mode-icon"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <rect x="2" y="2" width="5" height="5" rx="1" />
            <rect x="9" y="2" width="5" height="5" rx="1" />
            <rect x="2" y="9" width="5" height="5" rx="1" />
            <rect x="9" y="9" width="5" height="5" rx="1" />
        </svg> -->
        <span>{clampedCmdName}</span>
        <svg
            class="chevron"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <path d="M3 4.5L6 7.5L9 4.5" />
        </svg>
    </button>
{/key}

<script lang="ts">
    import { currentTrayView, currentFocus, currentCmd, trayOpen } from "$lib/stores/globals.js";
    import { blur } from 'svelte/transition';

    $: clampedCmdName = $currentCmd && $currentCmd?.length > 10 ? 
        $currentCmd.slice(0, 7).trim() + "..." : 
        $currentCmd ?? "-----";
</script>