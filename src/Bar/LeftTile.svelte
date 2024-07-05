
{#key clampedCmdName}
<!-- class="select-none rounded-md self-stretch flex items-center justify-center px-2 font-light text-lg cursor-pointer hover:shadow-md py-0.5 w-15 absolute justify-center align-middle self-center" -->
<div
    transition:blur={{duration: 200}}
    id="leftTile"
    class="select-none rounded-md self-stretch flex items-center justify-center px-2 font-light text-lg cursor-pointer hover:shadow-md py-0.5 w-18 absolute justify-center align-middle self-center "
    on:click={ 
        (e) => {
            $currentTrayView = "cmdSelector";
            $trayOpen = true;
        }
    }
    on:keydown={
        (e) => {
            if (e.key === "Enter") {
                $currentTrayView = "cmdSelector";
            }
        }
    }
>

        <div>{clampedCmdName}</div>

</div>
{/key}

<script lang="ts">
    import { currentTrayView, currentFocus, currentCmd, trayOpen } from "$lib/stores/globals.js";
    import { blur, scale, slide, fade, fly, crossfade } from 'svelte/transition';

    $: clampedCmdName = $currentCmd && $currentCmd?.length > 10 ? 
        $currentCmd.slice(0, 7).trim() + "..." : 
        $currentCmd ?? "-----";
</script>