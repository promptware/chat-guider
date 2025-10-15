import { defineValidationSpec, type ValidationSpec } from '../src/validation.js';
import type { ToolzyFeedback } from '../src/feedback.js';

// The purpose of this file is to assert compile-time types only (no runtime).

type Airline = {
  departure: string;
  arrival: string;
  date: string;
  passengers: number;
};

// Valid spec should type-check
const validSpec = defineValidationSpec<Airline>()({
  departure: {
    requires: [],
    influencedBy: ['arrival'],
    validate: async (value: unknown, context: { arrival?: string }) => ({ allowedOptions: ['London','Berlin'], isValid: true, normalizedValue: 'London' }),
  },
  arrival: {
    requires: ['departure'],
    influencedBy: ['date'],
    validate: async (value: unknown, context: { departure: string; date?: string }) => ({ allowedOptions: ['New York'], isValid: true, normalizedValue: 'New York' }),
  },
  date: {
    requires: ['departure','arrival'],
    influencedBy: ['passengers'],
    validate: async (value: unknown, context: { departure: string; arrival: string; passengers?: number }) => ({ allowedOptions: ['2026-10-01'], isValid: true, normalizedValue: '2026-10-01' }),
  },
  passengers: {
    requires: ['departure','arrival','date'],
    influencedBy: [],
    validate: async (value: unknown, context: { departure: string; arrival: string; date: string }) => ({ allowedOptions: [1,2,3], isValid: true, normalizedValue: 1 }),
  }
});

// Invalid: reference missing field in requires
const badRequires: ValidationSpec<Airline> = {
  departure: {
    // @ts-expect-error - nonexistent field in requires
    requires: ['nonexistent'],
    influencedBy: [],
    validate: async () => ({ allowedOptions: ['London'], isValid: true, normalizedValue: 'London' }),
  },
  arrival: { requires: [], influencedBy: [], validate: async () => ({ allowedOptions: ['New York'], isValid: true, normalizedValue: 'New York' }) },
  date: { requires: [], influencedBy: [], validate: async () => ({ allowedOptions: ['2026-10-01'], isValid: true, normalizedValue: '2026-10-01' }) },
  passengers: { requires: [], influencedBy: [], validate: async () => ({ allowedOptions: [1], isValid: true, normalizedValue: 1 }) },
};

// Invalid: fetchOptions param types must match requires/influencedBy
const badFetchTypes = defineValidationSpec<Airline>()({
  departure: {
    requires: [],
    influencedBy: ['arrival'],
    // @ts-expect-error - arrival should be string | undefined; wrong type provided
    validate: async (value: unknown, context: { arrival?: number }) => ({ allowedOptions: ['London'], isValid: true, normalizedValue: 'London' }),
  },
  arrival: { requires: [], influencedBy: [], validate: async () => ({ allowedOptions: ['New York'], isValid: true, normalizedValue: 'New York' }) },
  date: { requires: [], influencedBy: [], validate: async () => ({ allowedOptions: ['2026-10-01'], isValid: true, normalizedValue: '2026-10-01' }) },
  passengers: { requires: [], influencedBy: [], validate: async () => ({ allowedOptions: [1], isValid: true, normalizedValue: 1 }) },
});

// Invalid: influencedBy references a non-existing field
const badInfluences = defineValidationSpec<Airline>()({
  departure: {
    requires: [],
    // @ts-expect-error - non-existing field in influencedBy
    influencedBy: ['ghost'],
    validate: async () => ({ allowedOptions: ['London'], isValid: true, normalizedValue: 'London' }),
  },
  arrival: { requires: [], influencedBy: [], validate: async () => ({ allowedOptions: ['New York'], isValid: true, normalizedValue: 'New York' }) },
  date: { requires: [], influencedBy: [], validate: async () => ({ allowedOptions: ['2026-10-01'], isValid: true, normalizedValue: '2026-10-01' }) },
  passengers: { requires: [], influencedBy: [], validate: async () => ({ allowedOptions: [1], isValid: true, normalizedValue: 1 }) },
});

// Invalid: normalize must return domain-typed value or undefined
const badNormalize = defineValidationSpec<Airline>()({
  departure: { requires: [], influencedBy: [],
    validate: async () => ({ allowedOptions: ['London'], isValid: true, normalizedValue: 123 }) },
  arrival: { requires: [], influencedBy: [], validate: async () => ({ allowedOptions: ['New York'], isValid: true, normalizedValue: 'New York' }) },
  date: { requires: [], influencedBy: [], validate: async () => ({ allowedOptions: ['2026-10-01'], isValid: true, normalizedValue: '2026-10-01' }) },
  passengers: { requires: [], influencedBy: [], validate: async () => ({ allowedOptions: [1], isValid: true, normalizedValue: 1 }) },
})

