import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'reader-kinds',
      sidebar: [{ label: 'Guide', items: [{ autogenerate: { directory: 'guide' } }] }],
    }),
  ],
});
