import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { title } from './src/site-config.ts';

export default defineConfig({ integrations: [starlight({ title })] });
