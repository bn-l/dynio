
{#key clampedCmdName}
    <button
        transition:blur={{duration: 200}}
        id="leftTile"
        class="select-none rounded-md flex items-center justify-center px-2 font-light text-lg cursor-pointer hover:shadow-md py-0.5 w-23 absolute align-middle self-center outline-none border-none bg-inherit"
        on:click={ 
            () => {
                if ($currentTrayView === "cmdSelector") {
                    $currentTrayView = "stdout";
                    $currentFocus = "input";
                }
                else {
                    $currentTrayView = "cmdSelector";
                }
            }
        }
    >
        <div>{clampedCmdName}</div>
    </button>
{/key}

<script lang="ts">
    import { currentTrayView, currentFocus, currentCmd } from "$lib/stores/globals.js";
    import { blur } from 'svelte/transition';

    $: clampedCmdName = $currentCmd && $currentCmd?.length > 10 ? 
        $currentCmd.slice(0, 7).trim() + "..." : 
        $currentCmd ?? "-----";
</script>