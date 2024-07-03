

<div
    id="errorIndicator"
    class="h-1 cursor-pointer"
    bind:this={indicatorEl}
    on:click={() => { 
        $currentTrayView = clickView;
        $trayOpen = true;
    }}
>
    <slot />
</div>


<script  lang="ts">
    import "./indicatorAnimation.css";
    import { currentTrayView, trayOpen } from "$lib/stores/globals.js";
    import type { TrayViewType } from "$lib/stores/globals.js";
    import type { Readable } from "svelte/store";

    export let monitorStream: Readable<any>;
    export let clickView: TrayViewType;

    let indicatorEl: HTMLDivElement;

    function handleNewError() {
        console.log("saw new error");

        if (!indicatorEl) return;

        indicatorEl.classList.add("indicatorAnimation");

        const handleAnimationEnd = () => {
            indicatorEl.classList.remove("indicatorAnimation");
            indicatorEl.removeEventListener("animationend", handleAnimationEnd);
        }
        
        indicatorEl.addEventListener("animationend", handleAnimationEnd);
    }
    

    $: $monitorStream, handleNewError();
</script>
