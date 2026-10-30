// @ts-check
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

/**
 * Under "npm run dev": importerer PDF-er automatisk ved oppstart og når nye PDF-er legges i
 * kamprapporter/ eller mediarapporter/, og laster siden på nytt. Endringer i data/*.yaml gir også ny lasting.
 * @returns {import('astro').AstroIntegration}
 */
function autoImport() {
  return {
    name: 'djerv-auto-import',
    hooks: {
      'astro:server:setup': ({ server, logger }) => {
        const root = process.cwd();
        const tsx = createRequire(import.meta.url).resolve('tsx/cli');
        let running = false;
        let again = false;
        let timer = /** @type {NodeJS.Timeout | undefined} */ (undefined);
        const run = () => {
          if (running) {
            again = true;
            return;
          }
          running = true;
          logger.info('Importerer PDF-er …');
          const child = spawn(process.execPath, [tsx, 'scripts/import.ts'], { cwd: root, stdio: 'inherit' });
          child.on('exit', () => {
            running = false;
            server.ws.send({ type: 'full-reload' });
            if (again) {
              again = false;
              run();
            }
          });
        };
        const schedule = () => {
          clearTimeout(timer);
          timer = setTimeout(run, 1500); // vent til alle filene er kopiert ferdig
        };
        const pdfDirs = ['kamprapporter', 'mediarapporter'].map((d) => resolve(root, d));
        server.watcher.add([...pdfDirs, resolve(root, 'data')]);
        const onFile = (/** @type {string} */ file) => {
          const f = resolve(file);
          if (pdfDirs.some((d) => f.startsWith(d)) && f.toLowerCase().endsWith('.pdf')) schedule();
          else if (f.startsWith(resolve(root, 'data')) && f.endsWith('.yaml')) server.ws.send({ type: 'full-reload' });
        };
        server.watcher.on('add', onFile);
        server.watcher.on('change', onFile);
        run();
      },
    },
  };
}

// SITE_URL og BASE_PATH settes automatisk av GitHub Actions (se .github/workflows/deploy.yml),
// slik at siden fungerer både på https://<bruker>.github.io/<repo>/ og lokalt på http://localhost:4321/.
export default defineConfig({
  site: process.env.SITE_URL || undefined,
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [autoImport()],
  vite: { plugins: [tailwindcss()] },
});
