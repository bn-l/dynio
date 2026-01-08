

<div id="tray" class="relative overflow-hidden rounded-b-xl flex flex-col h-[20rem]">
    <div class="tray-content flex-grow overflow-hidden">
        <svelte:component this={currentTray.component} {...currentTray.props} />
    </div>
    {#if $statusBar.actions.length > 0 || $statusBar.count}
        <div class="status-bar">
            <div class="status-bar-actions">
                {#each $statusBar.actions as action}
                    <span class="status-bar-action">
                        <span class="key-badge">{action.key}</span>
                        <span>{action.label}</span>
                    </span>
                {/each}
            </div>
            <span class="status-bar-count">{$statusBar.count}</span>
        </div>
    {/if}
</div>

<script lang="ts">
    import { currentTrayView, statusBar } from "$lib/stores/globals.ts";
    import Stdout from "./Stdout/Stdout.svelte";
    import Stderr from "./Stderr.svelte";
    import CmdSelector from "./CmdSelector.svelte";
    import ErrorList from "./ErrorList.svelte";

    import type { SvelteComponent } from "svelte";



    let currentTray: { component: new (...args: any[]) => SvelteComponent, props: any };

    $: {
        switch ($currentTrayView) {
            case "stdout":
                currentTray = { component: Stdout, props: {} };
                break;
            case "stderr":
                currentTray = { component: Stderr, props: {} };
                break;
            case "cmdSelector":
                currentTray = { component: CmdSelector, props: { } };
                break;
            case "errors":
                currentTray = { component: ErrorList, props: {} };
                break;
            default:
                currentTray = { component: Stdout, props: {} };
        }
    }
    
</script>

