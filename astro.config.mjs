// @ts-check
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// SITE_URL og BASE_PATH settes automatisk av GitHub Actions (se .github/workflows/deploy.yml),
// slik at siden fungerer både på https://<bruker>.github.io/<repo>/ og lokalt på http://localhost:4321/.
export default defineConfig({
  site: process.env.SITE_URL || undefined,
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'always',
  build: { format: 'directory' },
  vite: { plugins: [tailwindcss()] },
});
