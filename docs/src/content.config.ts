import { glob } from 'astro/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { defineCollection } from 'astro:content';

/**
 * The pages are the READMEs themselves, read in place, so GitHub and the site
 * show the same file. README.md becomes the index; src/NN-name/README.md
 * becomes /NN-name/.
 */
export const collections = {
  docs: defineCollection({
    loader: glob({
      base: '..',
      pattern: ['README.md', 'src/[0-9][0-9]-*/README.md'],
      generateId: ({ entry }) =>
        entry === 'README.md' ? 'index' : entry.split('/')[1]!,
    }),
    schema: docsSchema(),
  }),
};
