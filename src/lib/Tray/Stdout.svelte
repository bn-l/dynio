




<script lang="ts">
    import { AnsiUp } from "ansi_up";
    import { useGlobalStore } from "../store/global-store.ts";
    import { activate } from "./activator.ts";
    import { useCmdConfigStore } from "../store/cmd-config-store.ts";
    import { useCallback, useEffect, useState} from "react";
    import { listen, Event } from "@tauri-apps/api/event";
</script>