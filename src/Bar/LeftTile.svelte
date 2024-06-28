

<div
    id="leftTile"
    tabIndex={2}
    use:focusSync={"tile"}
    class="select-none rounded-md self-stretch flex items-center justify-center px-2 font-light text-lg cursor-pointer hover:shadow-md"
    on:click={ 
        (e) => {
            $currentTrayView = "cmdSelector";
            $currentFocus = "tray";
            $trayOpen = true;
        }
    }
    on:keydown={
        (e) => {
            if (e.key === "Enter") {
                $currentTrayView = "cmdSelector";
                $currentFocus = "tray";
            }
        }
    }
>
    {$currentCmd ?? "-----"}
</div>

<script lang="ts">
    import { focusSync } from "$lib/actions/focusSync.js";
    import { currentTrayView, currentFocus, currentCmd, trayOpen } from "$lib/stores/globals.js";

    console.log($currentTrayView);
</script>