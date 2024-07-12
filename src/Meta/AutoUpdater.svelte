
<script>

    // import { checkUpdate, installUpdate } from '@tauri-apps/api/updater';
    // import { relaunch } from '@tauri-apps/api/process';
    import { TauriEvent, emit } from "@tauri-apps/api/event";

    // ! Just emitting the event to open the dialogue here might not be enough but 
    // this: https://tauri.app/v1/guides/distribution/updater/#built-in-dialog
    // seems to indicate that it might.
    void emit(TauriEvent.CHECK_UPDATE);

    // void checkUpdate().then(updateStatus => {
    //     if (updateStatus.shouldUpdate) {
    //         console.log(`Installing update ${updateStatus.manifest?.version}, ${updateStatus.manifest?.date}, ${updateStatus.manifest?.body}`);
    //         void installUpdate().then( () => void relaunch());
    //     }
    // });
</script>