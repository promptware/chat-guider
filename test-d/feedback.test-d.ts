import z from 'zod';
import { mkTool } from '../src/mk-tool.js';

type D = { a: string; b: number };

const DSchema = z.object({ a: z.string(), b: z.number() });
const Loose = z.object({ a: z.string().optional(), b: z.number().optional() });
const Out = z.object({ ok: z.boolean() });

// Exhaustiveness should be enforced at build()
// Building early should be a type error (no dummy arg accepted)
mkTool<D, typeof Loose, typeof Out>({
  schema: DSchema,
  toolSchema: Loose,
  outputSchema: Out,
  execute: async v => ({ ok: !!v }),
})
  .field('a', {
    requires: [],
    influencedBy: [] as const,
    validate: async () => ({ valid: true, normalizedValue: 'x' }),
  })
  // @ts-expect-error - cannot build before adding all fields
  .build();

// Correct usage: both fields then build()
mkTool<D, typeof Loose, typeof Out>({
  schema: DSchema,
  toolSchema: Loose,
  outputSchema: Out,
  execute: async v => ({ ok: !!v }),
})
  .field('a', {
    requires: [],
    influencedBy: [] as const,
    validate: async () => ({ valid: true, normalizedValue: 'x' }),
  })
  .field('b', {
    requires: ['a'] as const,
    influencedBy: [] as const,
    validate: async (v, ctx: { a: string }) => ({ valid: true, normalizedValue: 1 }),
  })
  .build();

import { ToolzyFeedback } from '../src/feedback.js';

type Airline = {
  departure: string;
  arrival: string;
  date: string;
  passengers: number;
};

// Tool feedback typing: per-field allowedOptions type safety
type Feedback = ToolzyFeedback<Airline, Airline>;
const okFeedbackAccepted: Feedback = {
  tag: 'accepted',
  value: { departure: 'a', arrival: 'b', date: 'd', passengers: 1 },
};
const okFeedbackRejected: Feedback = {
  tag: 'rejected',
  validationResults: {
    departure: { valid: true, allowedOptions: ['x', 'y'] },
    arrival: { valid: true, allowedOptions: ['a', 'b'] },
    date: { valid: true, allowedOptions: ['d', 'e'] },
    passengers: { valid: true, allowedOptions: [1, 2] },
  },
};

const badFeedbackPassengers: Feedback = {
  tag: 'rejected',
  validationResults: {
    departure: { valid: true },
    arrival: { valid: true },
    date: { valid: true },
    // @ts-expect-error passengers allowedOptions must be number[]
    passengers: { valid: true, allowedOptions: ['1'] },
  },
};

const badFeedbackDeparture: Feedback = {
  tag: 'rejected',
  validationResults: {
    passengers: { valid: true },
    arrival: { valid: true },
    date: { valid: true },
    // @ts-expect-error departure allowedOptions must be string[]
    departure: { valid: true, allowedOptions: [1] },
  },
};
