import type { defineValidationSpec, ValidationSpec } from '../src/validation.js';
import type { ToolzyFeedback } from '../src/feedback.js';

// The purpose of this file is to assert compile-time types only (no runtime).

type Airline = {
  departure: string;
  arrival: string;
  date: string;
  passengers: number;
};

declare const defineSpec: typeof defineValidationSpec<Airline>;

// Valid spec should type-check
const validSpec = defineSpec()({
  departure: {
    requires: [],
    influencedBy: ['arrival'],
    fetchOptions: async (filters: { arrival?: string }) => ['London','Berlin'],
  },
  arrival: {
    requires: ['departure'],
    influencedBy: ['date'],
    fetchOptions: async (filters: { departure: string; date?: string }) => ['New York'],
  },
  date: {
    requires: ['departure','arrival'],
    influencedBy: ['passengers'],
    fetchOptions: async (filters: { departure: string; arrival: string; passengers?: number }) => ['2026-10-01'],
  },
  passengers: {
    requires: ['departure','arrival','date'],
    influencedBy: [],
    fetchOptions: async (filters: { departure: string; arrival: string; date: string }) => [1,2,3],
  }
});

// Invalid: reference missing field in requires
const badRequires: ValidationSpec<Airline> = {
  departure: {
    // @ts-expect-error - nonexistent field in requires
    requires: ['nonexistent'],
    influencedBy: [],
    fetchOptions: async () => ['London'],
  },
  arrival: { requires: [], influencedBy: [], fetchOptions: async () => ['New York'] },
  date: { requires: [], influencedBy: [], fetchOptions: async () => ['2026-10-01'] },
  passengers: { requires: [], influencedBy: [], fetchOptions: async () => [1] },
};

// Invalid: fetchOptions param types must match requires/influencedBy
const badFetchTypes = defineSpec()({
  departure: {
    requires: [],
    influencedBy: ['arrival'],
    // @ts-expect-error - arrival should be string | undefined; wrong type provided
    fetchOptions: async (filters: { arrival?: number }) => ['London'],
  },
  arrival: { requires: [], influencedBy: [], fetchOptions: async () => ['New York'] },
  date: { requires: [], influencedBy: [], fetchOptions: async () => ['2026-10-01'] },
  passengers: { requires: [], influencedBy: [], fetchOptions: async () => [1] },
});

// Invalid: influencedBy references a non-existing field
const badInfluences = defineSpec()({
  departure: {
    requires: [],
    // @ts-expect-error - non-existing field in influencedBy
    influencedBy: ['ghost'],
    fetchOptions: async () => ['London'],
  },
  arrival: { requires: [], influencedBy: [], fetchOptions: async () => ['New York'] },
  date: { requires: [], influencedBy: [], fetchOptions: async () => ['2026-10-01'] },
  passengers: { requires: [], influencedBy: [], fetchOptions: async () => [1] },
});

// Invalid: normalize must return domain-typed value or undefined
const badNormalize = defineSpec()({
  departure: { requires: [], influencedBy: [], fetchOptions: async () => ['London'],
    // @ts-expect-error - normalize must return string | undefined for departure
    normalize: () => 123 },
  arrival: { requires: [], influencedBy: [], fetchOptions: async () => ['New York'] },
  date: { requires: [], influencedBy: [], fetchOptions: async () => ['2026-10-01'] },
  passengers: { requires: [], influencedBy: [], fetchOptions: async () => [1] },
});


