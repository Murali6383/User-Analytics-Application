import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        setupFiles: './src/test/setup.ts',
        globals: true,
    },
    server: {
        port: 5173,
        host: '0.0.0.0',
    },
    preview: {
        port: 4173,
        host: '0.0.0.0',
    },
});
