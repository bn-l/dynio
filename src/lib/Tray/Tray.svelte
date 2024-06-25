

<div
    id="tray"
    tabIndex={1}
    class="border-0 border-t-2 border-solid border-gray-300 relative overflow-hidden rounded-b-md h-[20rem] whitespace-pre-wrap"
    use:focusSync={"tray"}
>
    <slot />
</div>


<script lang="ts">
    import { focusSync } from "$lib/actions/focusSync.ts";

</script>

