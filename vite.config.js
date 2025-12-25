import path from 'node:path';
import react from '@vitejs/plugin-react';
import { createLogger, defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa'; // ✅ Importar el plugin PWA

// Tus plugins personalizados existentes
import inlineEditPlugin from './plugins/visual-editor/vite-plugin-react-inline-editor.js';
import editModeDevPlugin from './plugins/visual-editor/vite-plugin-edit-mode.js';
import iframeRouteRestorationPlugin from './plugins/vite-plugin-iframe-route-restoration.js';
import selectionModePlugin from './plugins/selection-mode/vite-plugin-selection-mode.js';

const isDev = process.env.NODE_ENV !== 'production';

// --- (Mantengo tus constantes de ErrorHandlers intactas para no romper nada) ---
const configHorizonsViteErrorHandler = `...`; // (Tu código original)
const configHorizonsRuntimeErrorHandler = `...`; // (Tu código original)
const configHorizonsConsoleErrroHandler = `...`; // (Tu código original)
const configWindowFetchMonkeyPatch = `...`; // (Tu código original)
const configNavigationHandler = `...`; // (Tu código original)

const addTransformIndexHtml = {
    name: 'add-transform-index-html',
    transformIndexHtml(html) {
        const tags = [
            { tag: 'script', attrs: { type: 'module' }, children: configHorizonsRuntimeErrorHandler, injectTo: 'head' },
            { tag: 'script', attrs: { type: 'module' }, children: configHorizonsViteErrorHandler, injectTo: 'head' },
            { tag: 'script', attrs: { type: 'module' }, children: configHorizonsConsoleErrroHandler, injectTo: 'head' },
            { tag: 'script', attrs: { type: 'module' }, children: configWindowFetchMonkeyPatch, injectTo: 'head' },
            { tag: 'script', attrs: { type: 'module' }, children: configNavigationHandler, injectTo: 'head' },
        ];

        if (!isDev && process.env.TEMPLATE_BANNER_SCRIPT_URL && process.env.TEMPLATE_REDIRECT_URL) {
            tags.push({
                tag: 'script',
                attrs: {
                    src: process.env.TEMPLATE_BANNER_SCRIPT_URL,
                    'template-redirect-url': process.env.TEMPLATE_REDIRECT_URL,
                },
                injectTo: 'head',
            });
        }
        return { html, tags };
    },
};

console.warn = () => {};
const logger = createLogger();
const loggerError = logger.error;
logger.error = (msg, options) => {
    if (options?.error?.toString().includes('CssSyntaxError: [postcss]')) return;
    loggerError(msg, options);
}

export default defineConfig({
    customLogger: logger,
    plugins: [
        ...(isDev ? [inlineEditPlugin(), editModeDevPlugin(), iframeRouteRestorationPlugin(), selectionModePlugin()] : []),
        react(),
        addTransformIndexHtml,
        // ✅ CONFIGURACIÓN PWA AÑADIDA
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
            manifest: {
                name: 'Gestify',
                short_name: 'Gestify',
                description: 'Sistema de gestión de inventario y pedidos',
                theme_color: '#4f46e5',
                background_color: '#ffffff',
                display: 'standalone',
                icons: [
                    {
                        src: 'pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable'
                    }
                ]
            }
        })
    ],
    server: {
        cors: true,
        headers: { 'Cross-Origin-Embedder-Policy': 'credentialless' },
        allowedHosts: true,
    },
    resolve: {
        extensions: ['.jsx', '.js', '.tsx', '.ts', '.json'],
        alias: { '@': path.resolve(__dirname, './src') },
    },
    build: {
        rollupOptions: {
            external: ['@babel/parser', '@babel/traverse', '@babel/generator', '@babel/types']
        }
    }
});