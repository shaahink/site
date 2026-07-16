import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      tags: z.array(z.string()).default([]),
      /** Series membership: id into src/data/series.ts + reading-order position. */
      series: z.string().optional(),
      seriesOrder: z.number().int().positive().optional(),
      draft: z.boolean().default(false),
      heroImage: image().optional(),
    }),
});

export const collections = { blog };
