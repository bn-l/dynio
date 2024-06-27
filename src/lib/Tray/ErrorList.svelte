


<!-- <div
    class=""
>  
    <div
        class=""
        onClick={clearErrors}
    >
        clear
    </div>

    {#each $errors as {id, message, type, timestamp} (id)}
        <div
            class=""
        >   
            <div
                class=""
                onClick={() => removeError(id)}
            >
                <X /> 
            </div>
            <div
                class=""
            >
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
    
</div> -->

<!-- <script lang="ts">

    import errors from "$lib/stores/errors.ts";

    function formatTimestamp(timestamp: number): string {
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = (`0${date.getMonth() + 1}`).slice(-2); // Months are 0 based
        const day = (`0${date.getDate()}`).slice(-2);
        const hours = (`0${date.getHours()}`).slice(-2);
        const minutes = (`0${date.getMinutes()}`).slice(-2);
        return `${hours}:${minutes} ${year}/${month}/${day}`;
    }

</script> -->
