import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';

export default defineConfig({
    plugins: [react(), viteCommonjs()],

    resolve: {
        alias: {
            'node:events': 'events/',
            events: 'events/',
        },
    },

    optimizeDeps: {
        exclude: [
            '@cornerstonejs/dicom-image-loader',
        ],
        include: ['dicom-parser'],
    },

    worker: {
        format: 'es',
    },
});
