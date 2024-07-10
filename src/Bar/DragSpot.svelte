
<!-- style="box-shadow: inset 0px 0px 5px 0px hsl(0deg 0% 0% / 2%);" -->

<!-- class="absolute right-0 top-0 bottom-0 w-[2%] rounded-e-md cursor-grab" -->

<div
    id="dragSpot"
    class="absolute right-0 top-3 bottom-3 w-[2%] rounded-md cursor-grab"
    
    on:mousedown={() => {
        appWindow.startDragging();
    }}
></div>



<script lang="ts">
    import { appWindow } from "@tauri-apps/api/window";
</script>
