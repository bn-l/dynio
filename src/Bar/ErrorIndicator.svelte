
{#if $errors.length > 0}
    <div class="absolute right--3 top-2">
        <Indicator clickView="errors" monitorStream={errors}>
            <svg 
                id="errorOctogonSvg"
                class="fill-red-50 stroke-neutral-500 opacity-100"
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                height="1em" width="1em" 
                fill=""
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
    </div>
{/if}

<script  lang="ts">
    import "./indicatorAnimation.css";
    import Indicator from "./Indicator.svelte";
    import { errors } from "$lib/stores/errors.ts";

</script>
