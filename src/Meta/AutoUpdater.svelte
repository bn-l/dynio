<script lang="ts">
    import { onMount } from 'svelte';
    import { check } from '@tauri-apps/plugin-updater';
    import { relaunch } from '@tauri-apps/plugin-process';

    onMount(() => {
        check().then(update => {
            if (update) {
                console.log(`Update available: ${update.version}`);
                update.downloadAndInstall().then(() => relaunch());
            }
        }).catch(err => {
            console.error('Failed to check for updates:', err);
        });
    });
</script>
