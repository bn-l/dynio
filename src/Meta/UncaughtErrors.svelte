<div 
    id="errorFallback"
    class="bg-gradient-to-b from-red-100 to-red-50 rounded-md z-50 absolute left-0 top-3 right-0 bottom-5 p-3"
>
<div 
    id="errorFallbackTitle"
    class="font-semibold text-lg border-solid border-2 rounded-md p-4"
>
    <div
        class="relative"
    >
        This App has experienced a critical error
        <button
            id="errorExitButton"
            type="button"
            class="border-none bg-gray-50 font-sans text-xl absolute right-0 cursor-pointer hover:bg-red-50 rounded-md "
            on:click={() => void exit(1)}
        >
            EXIT
        </button>
    </div>

</div>
<div 
    id="errorFallbackBody"
    class="overflow-y-auto leading-relaxed text-base h-75 nice-scroll mt-5"
>
    <pre
        class="text-wrap m-0"
    >{errorMessage}</pre>
</div>
</div>


<script lang="ts">
    import { exit } from '@tauri-apps/api/process';
    
    export let error: Error;

    $: errorMessage = error && error instanceof Error ?
            error.message :
            JSON.stringify(error);
</script>