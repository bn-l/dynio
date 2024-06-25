

<div
    id="dragSpot"
    class="absolute right-0 top-0 bottom-0 w-[2%] rounded-e-md cursor-grab"
    style="box-shadow: inset 0px 0px 5px 0px hsl(0deg 0% 0% / 2%);"
    on:mousedown={() => {
        appWindow.startDragging();
    }}
></div>



<script lang="ts">
    import { appWindow } from "@tauri-apps/api/window";
</script>
