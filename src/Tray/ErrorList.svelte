
<ClearablePanel 
    panelHeading="Errors"
    onClear={() => {
        errors.clear();
    }}
>
    <div
        class="grid grid-cols-20 gap-2 gap-y-3 w-138"
    >   
        {#each $errors as {id, message, type, timestamp, count} (id)}
            <div
                class="col-span-2"
                on:click={() => errors.removeError(id)}
            >
                <!-- round circle with x -->
                <div 
                    class="cursor-pointer hover:text-orange-600 text-center rounded-md" 
                >
                    <code>del</code>
                </div>
            </div>
            <div
                class="col-span-1"
            >
                {count}
            </div>
            <div
                class="col-span-13"
            >
                {message}
            </div>
            <div
                class="col-span-2"
            >
                {type}
            </div>
            <div
                class="col-span-2"
            >
                {formatTimestamp(timestamp)}
            </div>
        {/each}
    </div>
</ClearablePanel>

<script lang="ts">

    import { errors } from "$lib/stores/errors.ts";
    import ClearablePanel from "$lib/utils/ClearablePanel.svelte";

    function formatTimestamp(timestamp: number): string {
        const date = new Date(timestamp);
        const hours = (`0${date.getHours()}`).slice(-2);
        const minutes = (`0${date.getMinutes()}`).slice(-2);
        const seconds = (`0${date.getSeconds()}`).slice(-2);
        return `${hours}:${minutes}:${seconds}`;
    }

</script>
