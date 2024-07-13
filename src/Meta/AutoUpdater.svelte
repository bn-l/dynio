
<script>

    import { onMount } from 'svelte';
    // import { checkUpdate, installUpdate } from '@tauri-apps/api/updater';
    // import { relaunch } from '@tauri-apps/api/process';
    import { TauriEvent, emit } from "@tauri-apps/api/event";

    onMount(() => {

        // ! Just emitting the event to open the dialogue here might not be enough but 
        // this: https://tauri.app/v1/guides/distribution/updater/#built-in-dialog
        // seems to indicate that it might.
        void emit(TauriEvent.CHECK_UPDATE).then(() => console.log("emitted auto update"));
    
        // void checkUpdate().then(updateStatus => {
        //     console.log("updateStatus: ", updateStatus);
        //     if (updateStatus.shouldUpdate) {
        //         console.log(`Installing update ${updateStatus.manifest?.version}, ${updateStatus.manifest?.date}, ${updateStatus.manifest?.body}`);
        //         void installUpdate().then( () => void relaunch());
        //     }
        // });

    });
</script>