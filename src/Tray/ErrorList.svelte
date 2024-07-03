

<div
    class=""
    id="errorList"
>  
    <div
        class=""
        on:click={errors.clear}
    >
        clear
    </div>

    {#each $errors as {id, message, type, timestamp, count} (id)}
        <div
            class=""
        >   
            <div
                class=""
                on:click={() => errors.removeError(id)}
            >
                <!-- round circle with x -->
                <svg class="" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
            </div>
            <div
                class=""
            >
                <div
                    class=""
                >
                    {count}
                </div>
                <div
                    class=""
                >
                    {message}
                </div>
                <div
                    class=""
                >
                    {type}
                </div>
                <div
                    class=""
                >
                    {formatTimestamp(timestamp)}
                </div>
            </div>
        </div>
    {/each}
    
</div>

<script lang="ts">

    import { errors } from "$lib/stores/errors.ts";
    

    function formatTimestamp(timestamp: number): string {
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = (`0${date.getMonth() + 1}`).slice(-2); // Months are 0 based
        const day = (`0${date.getDate()}`).slice(-2);
        const hours = (`0${date.getHours()}`).slice(-2);
        const minutes = (`0${date.getMinutes()}`).slice(-2);
        const seconds = (`0${date.getSeconds()}`).slice(-2);
        return `${hours}:${minutes}:${seconds}`;
    }

</script>
