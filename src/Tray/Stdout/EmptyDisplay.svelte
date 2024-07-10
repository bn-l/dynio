
<div
    id="emptyDisplay"
    class="text-3xl text-center h-76 flex justify-center items-center"
>
    <div
        id="emptyDisplayMessage"
        class=""
    >
        {#if message}
            {message}
        {:else}
            <div
                id="emptyDisplayImage"
                class="flex items-center"
            >
                <img 
                    class="h-40 w-40 grayscale-100 brightness-150 opacity-10" 
                    src={appIcon} alt="App icon" 
                />
            </div>
        {/if}
    </div>
</div>

<script lang="ts">
    export let message = "";
    export let showBackground = false;
    import appIcon from "../../../app-icon.png";
</script>