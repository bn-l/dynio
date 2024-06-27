
<div
    id="noOutput"
    class="flex flex-col justify-stretch items-stretch gap-4 pb-2 pt-3"
>
    <div
        id="output"
        class="grid grid-cols-10 gap-3"
    >
        <div
            id="outputValue"
            class="col-span-9 flex-row-start text-3xl"
        >
            {message}
        </div>
    </div>
</div>

<script lang="ts">
    export let message = "";
</script>