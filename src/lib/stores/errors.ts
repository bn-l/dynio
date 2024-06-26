
import { nanoid } from 'nanoid'
import { writable } from 'svelte/store';

type ErrorType = "js" | "tauri" | "shell" | "unknown";

type ErrorItem = {
    id: string;
    timestamp: number; 
    message: string;
    type: ErrorType;
}

function createErrorStore() {
    const { subscribe, set, update } = writable<ErrorItem[]>([]);

    return {
        subscribe,
        addError: (message: string, type: ErrorType) => {
            const timestamp = Date.now();
            const id = nanoid(10);
            update(errors => [...errors, { id, timestamp, message, type }]);
        },
        removeError: (id: string) => {
            update(errors => errors.filter(error => error.id !== id));
        },
        clear: () => set([])
    }
}

const errors = createErrorStore();

export default errors;
