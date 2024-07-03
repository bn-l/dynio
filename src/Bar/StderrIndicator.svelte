

<Indicator clickView="stderr" monitorStream={stderr}>
    <svg 
        id="errorOctogonSvg" 
        class=""
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="0 0 24 24" 
        height="1em" width="1em" 
        fill={$settings.darkMode ? "#ef4444" : "#fee2e2"} 
        stroke="currentColor" 
        stroke-width="2" 
        stroke-linecap="round" 
        stroke-linejoin="round" 
    >
        <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
</Indicator>


<script  lang="ts">
    import { currentTrayView, stderr, trayOpen } from "$lib/stores/globals.js";
    import { settings } from "$lib/stores/settings.js";
    import Indicator from "./Indicator.svelte";
</script>
