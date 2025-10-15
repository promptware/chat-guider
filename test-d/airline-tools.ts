import z from "zod";
import { generateText, Tool } from "ai";
import { mkTool } from "../src/feedback.js";
import { defineValidationSpec, compileFixup } from "../src/validation.js";
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

import "dotenv/config";

// Shared entries as in examples/airline.ts
const entries = [
  { departure: "london", arrival: "New York", date: "2026-10-01", seats: 100 },
  { departure: "london", arrival: "NY", date: "2026-10-02", seats: 2 },
  { departure: "Berlin", arrival: "New York", date: "2026-10-03", seats: 2 },
  { departure: "Berlin", arrival: "London", date: "2026-10-04", seats: 2 },
  { departure: "Paris", arrival: "Tokyo", date: "2026-10-05", seats: 50 },
  { departure: "New York", arrival: "Los Angeles", date: "2026-10-06", seats: 25 },
];

const uniq = <T,>(values: T[]): T[] => Array.from(new Set(values));

// This type is used as fully validated input for the tool's execute function
const AirlineBookingSchema = z.object({
  departure: z.string().min(1),
  arrival: z.string().min(1),
  date: z.string().min(1),
  passengers: z.number().min(1),
});
type AirlineBooking = z.infer<typeof AirlineBookingSchema>;

// This type is used as input schema for the LLM tool - partially filled call payload.
// Some of the fields can be made required, and it would force the LLM to provide them.
// This type can be quite different from `AirlineBooking`.
const AirlineBookingForLLMSchema = z.object({
  departure: z.string().optional().describe("City of departure, if known"),
  arrival: z.string().optional().describe("City of arrival, if known"),
  date: z.string().optional().describe("Date of departure, if known"),
  passengers: z.number().optional().describe("Number of passengers, if known"),
});

type AirlineBookingForLLM = z.infer<typeof AirlineBookingForLLMSchema>;

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

export const airlineValidationTool: any = mkTool({
  inputSchema: AirlineBookingSchema,
  outputSchema: AirlineBookingSchema,
  looseSchema: AirlineBookingForLLMSchema,
  description: "Validate and compute options for airline booking parameters.",
  fetchState: async () => ({}),
  fixup: compileFixup(spec),
  execute: async (input: AirlineBooking) => {
    console.log('airlineValidationTool.execute', input);
    return input;
  },
});

// text completion with tools using ai sdk:
const result = await generateText({
  model: createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! })(
    "openai/gpt-5"
  ),
  tools: { airlineValidationTool },
  toolChoice: 'auto',
  stopWhen: ({ steps }) => steps.length > 5,
  prompt: `Book a flight from London to New York for 2 passengers on 2026 October 2nd.
   use tools. try calling tools until you get a successful tool response.
   If you get a rejection, pay attention to the response validation and rejection reasons and retry.
   `,
});

console.log(JSON.stringify(result.content, null, 2));

console.log(result);