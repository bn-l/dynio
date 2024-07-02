

<div
    id="leftTile"
    class="select-none rounded-md self-stretch flex items-center justify-center px-2 font-light text-lg cursor-pointer hover:shadow-md"
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
    {$currentCmd ?? "-----"}
</div>

<script lang="ts">
    import { currentTrayView, currentFocus, currentCmd, trayOpen } from "$lib/stores/globals.js";

    console.log($currentTrayView);
</script>