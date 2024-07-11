
<script>
    import { checkUpdate, installUpdate } from '@tauri-apps/api/updater';
    import { relaunch } from '@tauri-apps/api/process';
    void checkUpdate().then(updateStatus => {
        if (updateStatus.shouldUpdate) {
            console.log(`Installing update ${updateStatus.manifest?.version}, ${updateStatus.manifest?.date}, ${updateStatus.manifest?.body}`);
            void installUpdate().then( () => void relaunch());
        }
    });
</script>