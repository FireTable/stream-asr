import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://asr.firetable.tech',
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false
    })
  ]
});
