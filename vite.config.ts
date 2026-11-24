import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * In dev mode, rewrite `/group/<name>` page requests (HTML navigation, not `.status.json`)
 * to `/index.html` so direct room links work identically to production.
 */
function galeneDevSpaFallback(): Plugin {
	return {
		name: 'calene-dev-spa-fallback',
		configureServer(server) {
			server.middlewares.use((req, _res, next) => {
				const url = req.url ?? '';
				if (
					req.method === 'GET' &&
					url.startsWith('/group/') &&
					!url.includes('.status') &&
					!url.includes('.')
				) {
					req.url = '/index.html';
				}
				next();
			});
		}
	};
}

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const galeneTarget = env.VITE_GALENE_PROXY_TARGET || 'http://127.0.0.1:8443';
	const isLocalTarget = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(galeneTarget);

	return {
		plugins: [tailwindcss(), svelte(), galeneDevSpaFallback()],
		resolve: {
			alias: {
				'@': resolve(__dirname, 'src')
			}
		},
		build: {
			outDir: 'dist',
			emptyOutDir: true,
			rollupOptions: {
				input: {
					main: resolve(__dirname, 'index.html'),
					galene: resolve(__dirname, 'galene.html')
				}
			}
		},
		server: {
			allowedHosts: true,
			proxy: {
				'/ws': {
					target: galeneTarget,
					ws: true,
					changeOrigin: !isLocalTarget,
					secure: false
				},
				'^/group/.+/\\.status(\\.json)?$': {
					target: galeneTarget,
					changeOrigin: !isLocalTarget,
					secure: false
				},
				'/galene-api': {
					target: galeneTarget,
					changeOrigin: !isLocalTarget,
					secure: false
				}
			}
		}
	};
});
