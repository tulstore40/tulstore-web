import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';

const site = process.env.PUBLIC_SITE_URL || 'https://tulstore.netlify.app';

export default defineConfig({
  site,
  output: 'server',
  adapter: netlify(),
});
