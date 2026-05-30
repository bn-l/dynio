
<!-- style="box-shadow: inset 0px 0px 5px 0px hsl(0deg 0% 0% / 2%);" -->

<!-- class="absolute right-0 top-0 bottom-0 w-[2%] rounded-e-md cursor-grab" -->

<div
    id="dragSpot"
    class="absolute right-0 top-3 bottom-3 w-[2%] rounded-md cursor-grab"
    on:mousedown={startDrag}
></div>



<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
    import { onDestroy } from "svelte";

    const appWindow = getCurrentWebviewWindow();
    let clearDragListeners: (() => void) | undefined;

    function startNativeDrag() {
        void invoke("begin_window_drag");
        void appWindow.startDragging();
    }

    function startDrag(event: MouseEvent) {
        if (event.button !== 0) return;

        clearDragListeners?.();
        startNativeDrag();

        const finishDrag = () => {
            clearDragListeners?.();
            void invoke("finish_window_drag");
        };

        clearDragListeners = () => {
            window.removeEventListener("mouseup", finishDrag);
            window.removeEventListener("blur", finishDrag);
            clearDragListeners = undefined;
        };

        window.addEventListener("mouseup", finishDrag);
        window.addEventListener("blur", finishDrag);
    }

    onDestroy(() => {
        clearDragListeners?.();
    });
</script>
