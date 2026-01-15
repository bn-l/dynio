import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
    plugins: [
        {
            name: 'mock-virtual-uno',
            resolveId(id) {
                if (id === 'virtual:uno.css') return '\0virtual:uno.css';
            },
            load(id) {
                if (id === '\0virtual:uno.css') return '';
            },
        },
        svelte({ hot: false }),
        svelteTesting(),
        tsconfigPaths(),
    ],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./vitest-setup.ts'],
        include: ['src/**/*.test.ts'],
        exclude: ['node_modules', 'src-tauri'],
    },
});
