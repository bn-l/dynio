import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            $lib: path.resolve(__dirname, './src/lib'),
        },
    },
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
        include: ['tests/**/*.test.ts'],
        exclude: ['node_modules', 'src-tauri'],
    },
});
