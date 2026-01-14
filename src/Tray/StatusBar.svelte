
<div class="status-bar">
    <div class="status-bar-left">
        {#if $statusBar.actions.length > 0}
            <div class="status-bar-actions">
                {#each $statusBar.actions as action, i (i)}
                    <span class="status-bar-action">
                        <span class="key-badge">{action.key}</span>
                        <span>{action.label}</span>
                    </span>
                {/each}
            </div>
        {/if}
    </div>
    <div class="status-bar-middle">
        {#if $stderr.length > 0}
            <button
                class="indicator-badge stderr-badge"
                on:click={() => { $currentTrayView = "stderr"; $trayOpen = true; }}
            >
                stderr
            </button>
        {/if}
        {#if $errors.length > 0}
            <button
                class="indicator-badge err-badge"
                bind:this={errBadgeEl}
                on:click={() => { $currentTrayView = "errors"; $trayOpen = true; }}
            >
                {$errors.length} err
            </button>
        {/if}
    </div>
    <div class="status-bar-right">
        {#if $statusBar.count}
            <span class="status-bar-count">{$statusBar.count}</span>
        {/if}
    </div>
</div>

<script lang="ts">
    import "./indicatorAnimation.css";
    import { statusBar, currentTrayView, trayOpen, stderr } from "$lib/stores/globals.ts";
    import { errors } from "$lib/stores/errors.ts";

    let errBadgeEl: HTMLButtonElement;
    let prevErrLen = 0;

    function triggerAnimation(el: HTMLElement | undefined) {
        if (!el) return;
        el.classList.add("indicatorAnimation");
        const handleAnimationEnd = () => {
            el.classList.remove("indicatorAnimation");
            el.removeEventListener("animationend", handleAnimationEnd);
        };
        el.addEventListener("animationend", handleAnimationEnd);
    }

    $: {
        if ($errors.length > prevErrLen && prevErrLen > 0) {
            triggerAnimation(errBadgeEl);
        }
        prevErrLen = $errors.length;
    }
</script>

<style>
    .status-bar {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        align-items: center;
        padding: 0.4rem 0.6rem;
        font-size: 0.75rem;
        color: var(--text-muted, #888);
        border-top: 1px solid var(--border-color, #333);
    }

    .status-bar-left {
        justify-self: start;
    }

    .status-bar-middle {
        display: flex;
        gap: 0.75rem;
        justify-self: center;
    }

    .status-bar-right {
        justify-self: end;
    }

    .status-bar-actions {
        display: flex;
        gap: 1rem;
    }

    .status-bar-action {
        display: flex;
        align-items: center;
        gap: 0.3rem;
    }

    .indicator-badge {
        cursor: pointer;
        padding: 0.15rem 0.4rem;
        border-radius: 0.25rem;
        border: none;
        font-size: 0.7rem;
        font-family: inherit;
        transition: opacity 0.15s ease;
    }

    .indicator-badge:hover {
        opacity: 0.8;
    }

    .stderr-badge {
        background-color: rgba(251, 146, 60, 0.2);
        color: rgb(251, 146, 60);
    }

    .err-badge {
        background-color: rgba(239, 68, 68, 0.2);
        color: rgb(239, 68, 68);
    }
</style>