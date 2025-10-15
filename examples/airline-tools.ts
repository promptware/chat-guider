import z from "zod";
import { mkTool } from "../src/feedback.js";
import { defineValidationSpec, compileFixup } from "../src/validation.js";

// Shared entries as in examples/airline.ts
const entries = [
  { departure: "London", arrival: "New York", date: "2026-10-01", seats: 100 },
  { departure: "London", arrival: "New York", date: "2026-10-02", seats: 1 },
  { departure: "Berlin", arrival: "New York", date: "2026-10-03", seats: 2 },
  { departure: "Berlin", arrival: "London", date: "2026-10-04", seats: 2 },
  { departure: "Paris", arrival: "Tokyo", date: "2026-10-05", seats: 50 },
  { departure: "New York", arrival: "Los Angeles", date: "2026-10-06", seats: 25 },
];

const uniq = <T,>(values: T[]): T[] => Array.from(new Set(values));

const AirlineBookingSchema = z.object({
  departure: z.string(),
  arrival: z.string(),
  date: z.string(),
  passengers: z.number(),
});

type AirlineBooking = z.infer<typeof AirlineBookingSchema>;

const AirlineBookingAttemptSchema = z.object({
  departure: z.string().optional(),
  arrival: z.string().optional(),
  date: z.string().optional(),
  passengers: z.number().optional(),
});

type AirlineBookingAttempt = z.infer<typeof AirlineBookingAttemptSchema>;

const spec = defineValidationSpec<AirlineBooking>()({
  departure: {
    requires: [],
    influencedBy: ['arrival'],
    description: "City of departure",
    fetchOptions: async (filters: { arrival?: string }) => {
      const filtered = entries.filter(e => (filters.arrival ? e.arrival === filters.arrival : true));
      return uniq(filtered.map(e => e.departure));
    }
  },
  arrival: {
    requires: ['departure'],
    influencedBy: ['date'],
    description: "City of arrival",
    fetchOptions: async (filters: { departure: string; date?: string }) => {
      const filtered = entries.filter(e =>
        e.departure === filters.departure &&
        (filters.date ? e.date === filters.date : true)
      );
      return uniq(filtered.map(e => e.arrival));
    }
  },
  date: {
    requires: ['departure','arrival'],
    influencedBy: ['passengers'],
    description: "Date of departure",
    fetchOptions: async (filters: { departure: string; arrival: string; passengers?: number }) => {
      const filtered = entries.filter(e =>
        e.departure === filters.departure &&
        e.arrival === filters.arrival &&
        (filters.passengers ? e.seats >= filters.passengers : true)
      );
      return uniq(filtered.map(e => e.date));
    }
  },
  passengers: {
    requires: ['departure','arrival','date'],
    influencedBy: [],
    description: "Number of passengers",
    normalize: (raw) => {
      const n = typeof raw === 'string' ? Number(raw) : raw;
      return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
    },
    fetchOptions: async (filters: { departure: string; arrival: string; date: string }) => {
      const filtered = entries.filter(e =>
        e.departure === filters.departure &&
        e.arrival === filters.arrival &&
        e.date === filters.date
      );
      return uniq(filtered.map(e => e.seats));
    },
    validate: (value, ctx) => {
      const max = Math.max(0, ...ctx.optionsForField.map(o => Number(o)));
      return value > max ? 'requested passengers exceed available seats' : undefined;
    }
  }
});

export const airlineValidationTool = mkTool({
  inputSchema: AirlineBookingSchema,
  outputSchema: AirlineBookingSchema,
  looseSchema: AirlineBookingAttemptSchema,
  description: "Validate and compute options for airline booking parameters.",
  fetchState: async () => ({}),
  fixup: compileFixup(spec),
  execute: async (input) => {
    console.log('airlineValidationTool.execute', input);
    return input;
  },
});

export type AirlineTool = typeof airlineValidationTool;


