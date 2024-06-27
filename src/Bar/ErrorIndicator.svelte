

<div
    id="errorIndicator"
    class="absolute right-0 h-1"
    on:click={() => $currentTrayView = "errors"}
>
    <svg 
        id="errorTriangleSvg" 
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="0 0 24 24" 
        height="1em" width="1em" 
        fill={$settings.darkMode ? "#ef4444" : "#fee2e2"} 
        stroke="currentColor" 
        stroke-width=2 
        stroke-linecap="round" 
        stroke-linejoin="round"
    >
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
</div>


<script  lang="ts">
    import { currentTrayView } from "$lib/stores/globals.js";
    import { settings } from "$lib/stores/settings.js";
</script>
