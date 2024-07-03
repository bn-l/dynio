

<script>
    import { checkUpdate, installUpdate } from '@tauri-apps/api/updater';
    void checkUpdate().then(updateStatus => {
        if (updateStatus.shouldUpdate) {
            console.log(`Installing update ${updateStatus.manifest?.version}, ${updateStatus.manifest?.date}, ${updateStatus.manifest?.body}`);
            void installUpdate();
        }
    });
</script>