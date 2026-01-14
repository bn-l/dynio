<div
    id="llmDisplay"
    class="h-71 pr-2"
>
<div
    bind:this={scrollEl}
    class="nice-scroll overflow-x-hidden overflow-y-auto h-full pl-4 pt-4 pb-4 pr-6"
>
    <div
        id="llmDisplayContainer"
        style={`font-size: ${fontSize}rem`}
    >
        {#if thinkingDisplay === "none"}
            <div class="prose m-1 mb-2">
                {@html renderMarkdown(processed.raw)}
            </div>
        {:else if thinkingDisplay === "show"}
            {#if processed.thinkOut}
                <div class="llm-thinking-content m-1 mb-2">
                    {@html renderMarkdown(processed.thinkOut)}
                </div>
            {/if}
            {#if processed.postThinkOut}
                <div class="prose m-1 mb-2">
                    {@html renderMarkdown(processed.postThinkOut)}
                </div>
            {/if}
        {:else if thinkingDisplay === "keepHidden"}
            {#key processed.isThinkDone}
                {#if !processed.isThinkDone && processed.isThinking}
                    <div class="llm-thinking-indicator m-1 mb-2" transition:fade={{ duration: 300 }}>
                        🧠 thinking... {processed.thinkCharCount}
                    </div>
                {:else if processed.isThinkDone}
                    <div class="prose m-1 mb-2" transition:fade={{ duration: 300 }}>
                        {@html renderMarkdown(processed.postThinkOut)}
                    </div>
                {:else}
                    <div class="prose m-1 mb-2" transition:fade={{ duration: 300 }}>
                        {@html renderMarkdown(processed.raw)}
                    </div>
                {/if}
            {/key}
        {:else if thinkingDisplay === "showWhileThinking"}
            {#key processed.isThinkDone}
                {#if !processed.isThinkDone && processed.isThinking}
                    <div class="llm-thinking-content m-1 mb-2" transition:fade={{ duration: 300 }}>
                        {@html renderMarkdown(processed.thinkOut)}
                    </div>
                {:else if processed.isThinkDone}
                    <div class="prose m-1 mb-2" transition:fade={{ duration: 300 }}>
                        {@html renderMarkdown(processed.postThinkOut)}
                    </div>
                {:else}
                    <div class="prose m-1 mb-2" transition:fade={{ duration: 300 }}>
                        {@html renderMarkdown(processed.raw)}
                    </div>
                {/if}
            {/key}
        {/if}
    </div>
</div>
</div>

<script lang="ts">
    import "./llmDisplay.css";
    import { fade } from "svelte/transition";
    import { onDestroy } from "svelte";
    import { currentCmdConfig } from "$lib/stores/cmd-config.ts";
    import { stdout, running, scrollContainer } from "$lib/stores/globals.ts";
    import { errors } from "$lib/stores/errors.ts";
    import { processLlmOutput } from "./processLlmOutput.ts";
    import { renderMarkdown } from "$lib/utils/markdown.ts";

    let scrollEl: HTMLElement;
    $: $scrollContainer = scrollEl;

    onDestroy(() => {
        $scrollContainer = null;
    });

    $: modeConfig = $currentCmdConfig?.modeConfig;
    $: displayOptions = modeConfig?.mode === "llm" ? modeConfig.displayOptions : undefined;

    $: thinkingDisplay = displayOptions?.thinkingDisplay ?? "none";

    $: processed = processLlmOutput(
        $stdout,
        displayOptions?.thinkingOpenPattern,
        displayOptions?.thinkingClosePattern
    );

    $: fontSize = displayOptions?.fontSize ?? 0.8;

    // Detect when command finishes with only thinking tokens (no actual output)
    let wasRunning = false;
    $: {
        if (wasRunning && !$running) {
            if (
                thinkingDisplay !== "none" &&
                processed.isThinkDone &&
                !processed.postThinkOut.trim() &&
                !processed.preThinkOut.trim()
            ) {
                errors.addError("There were no non-thinking tokens", "shell");
            }
        }
        wasRunning = $running;
    }
</script>
