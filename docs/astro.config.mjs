import starlight from '@astrojs/starlight';
import { readdirSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import mermaid from 'astro-mermaid';
import starlightThemeNova from 'starlight-theme-nova';
import rehypeTwinkleplop from '@twinkleplop/rehype';
import { language as typescript } from '@twinkleplop/typescript';
import { language as bash } from '@twinkleplop/bash';
import { language as json } from '@twinkleplop/json';
import remarkReadme from './src/remark-readme.mjs';

// One sidebar entry per part folder, in order. Labels come from each README's
// frontmatter, so adding src/11-name/README.md adds a page and a link.
const PARTS = readdirSync(new URL('../src', import.meta.url))
  .filter((name) => /^\d\d-/.test(name))
  .sort();

const REPO = 'https://github.com/jagreehal/nodejs-opentelemetry-workshop';

export default defineConfig({
  // The Pages workflow passes both from actions/configure-pages, so a fork
  // deploys to its own URL without editing this file.
  site: process.env.SITE ?? 'https://jagreehal.github.io',
  base: process.env.BASE ?? '/nodejs-opentelemetry-workshop',
  trailingSlash: 'always',
  markdown: {
    // Twinkleplop highlights instead of Shiki. Fences with no language, and
    // mermaid, stay as plain blocks for astro-mermaid to pick up.
    syntaxHighlight: false,
    processor: unified({
      remarkPlugins: [remarkReadme],
      rehypePlugins: [
        [
          rehypeTwinkleplop,
          {
            languages: { ts: typescript(), sh: bash(), json: json() },
            on_unknown_language: 'plain',
          },
        ],
      ],
    }),
  },
  integrations: [
    // Before starlight, as the integration requires.
    mermaid({ theme: 'neutral', autoTheme: true }),
    starlight({
      plugins: [starlightThemeNova()],
      title: 'Node.js OpenTelemetry Workshop',
      description:
        'From console.log to one trace across three services, in thirteen parts.',
      social: [{ icon: 'github', label: 'GitHub', href: REPO }],
      expressiveCode: false,
      customCss: ['@twinkleplop/theme-github', './src/code.css'],
      components: { Head: './src/Head.astro' },
      sidebar: [
        { label: 'Start here', link: '/' },
        { label: 'The thirteen parts', items: PARTS },
      ],
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
    }),
  ],
});
