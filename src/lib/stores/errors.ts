
import { nanoid } from 'nanoid'
import { writable } from 'svelte/store';

type ErrorType = "js" | "tauri" | "shell" | "unknown";

type ErrorItem = {
    id: string;
    timestamp: number; 
    message: string;
    type: ErrorType;
    count: number;
}

function createErrorStore() {
    const { subscribe, set, update } = writable<ErrorItem[]>([]);

    return {
        subscribe,
        addError: (message: string, type: ErrorType) => {

            const timestamp = Date.now();
            const id = nanoid(10);
            const normalizedMessage = message.trim().toLowerCase();
        
            update(errors => {
                const existingErrorIndex = errors.findIndex( (error) => {
                    return error.message.trim().toLowerCase() === normalizedMessage;
                });
        
                if (existingErrorIndex !== -1) {
                    const updatedErrors = [...errors];

                    updatedErrors[existingErrorIndex] = {
                        ...updatedErrors[existingErrorIndex],
                        count: updatedErrors[existingErrorIndex].count + 1,
                        timestamp
                    };

                    return updatedErrors;
                } else {
                    return [...errors, { id, timestamp, message, type, count: 1 }];
                }
            });
        },
        removeError: (id: string) => {
            update(errors => errors.filter(error => error.id !== id));
        },
        clear: () => set([])
    }
}

const errors = createErrorStore();

export default errors;
