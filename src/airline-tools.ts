import z from "zod";
import { mkTool, ToolzyFeedback } from "./feedback.js";

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

const looseSchema = z.object({
  departure: z.string().optional(),
  arrival: z.string().optional(),
  date: z.string().optional(),
  passengers: z.number().optional(),
});

const inputSchema = z.object({
  departure: z.string(),
  arrival: z.string(),
  date: z.string(),
  passengers: z.number(),
});

export const airlineValidationTool = mkTool({
  inputSchema,
  outputSchema: inputSchema,
  looseSchema,
  description: "Validate and compute options for airline booking parameters.",
  fetchState: async () => ({}),
  fixup: async (input): Promise<ToolzyFeedback<z.infer<typeof inputSchema>>> => {
    const reasons: { field: string; allowedOptions?: string[]; refusalReason?: string }[] = [];

    // Allowed sets based on provided filters where meaningful
    const allowedDepartures = uniq(
      entries
        .filter(e => (typeof input.arrival === 'string' ? e.arrival === input.arrival : true))
        .map(e => e.departure)
    );
    const allowedArrivals = uniq(
      entries
        .filter(e => (typeof input.departure === 'string' ? e.departure === input.departure : true))
        .filter(e => (typeof input.date === 'string' ? e.date === input.date : true))
        .map(e => e.arrival)
    );
    const allowedDates = uniq(
      entries
        .filter(e => (typeof input.departure === 'string' ? e.departure === input.departure : true))
        .filter(e => (typeof input.arrival === 'string' ? e.arrival === input.arrival : true))
        .filter(e => (typeof input.passengers === 'number' ? e.seats >= input.passengers : true))
        .map(e => e.date)
    );

    const allowedPassengers = uniq(
      entries
        .filter(e => (typeof input.departure === 'string' ? e.departure === input.departure : true))
        .filter(e => (typeof input.arrival === 'string' ? e.arrival === input.arrival : true))
        .filter(e => (typeof input.date === 'string' ? e.date === input.date : true))
        .map(e => e.seats)
    ).map(n => String(n));

    if (typeof input.departure === 'string' && !allowedDepartures.includes(input.departure)) {
      reasons.push({ field: 'departure', allowedOptions: allowedDepartures });
    }
    if (typeof input.arrival === 'string' && !allowedArrivals.includes(input.arrival)) {
      reasons.push({ field: 'arrival', allowedOptions: allowedArrivals });
    }
    if (typeof input.date === 'string' && !allowedDates.includes(input.date)) {
      reasons.push({ field: 'date', allowedOptions: allowedDates });
    }
    const allowedPassengerNums = uniq(
      entries
        .filter(e => (typeof input.departure === 'string' ? e.departure === input.departure : true))
        .filter(e => (typeof input.arrival === 'string' ? e.arrival === input.arrival : true))
        .filter(e => (typeof input.date === 'string' ? e.date === input.date : true))
        .map(e => e.seats)
    );
    if (typeof input.passengers === 'number') {
      const requestedPassengers = input.passengers as number;
      if (!allowedPassengerNums.some(n => n >= requestedPassengers)) {
        reasons.push({ field: 'passengers', refusalReason: 'requested passengers exceed available seats', allowedOptions: allowedPassengerNums.map(String) });
      }
    } else {
      reasons.push({ field: 'passengers', allowedOptions: allowedPassengerNums.map(String) });
    }

    // Also reject if any required field is missing
    if (typeof input.departure !== 'string') {
      reasons.push({ field: 'departure', allowedOptions: uniq(entries.map(e => e.departure)) });
    }
    if (typeof input.arrival !== 'string') {
      reasons.push({ field: 'arrival', allowedOptions: uniq(entries.map(e => e.arrival)) });
    }
    if (typeof input.date !== 'string') {
      reasons.push({ field: 'date', allowedOptions: uniq(entries.map(e => e.date)) });
    }

    if (reasons.length > 0) {
      return { tag: 'rejected', reasons };
    }

    return { tag: 'accepted', value: {
      departure: input.departure as string,
      arrival: input.arrival as string,
      date: input.date as string,
      passengers: input.passengers as number,
    } };
  },
  execute: async (input) => {
    console.log('airlineValidationTool.execute', input);
    return input;
  },
});

export type AirlineTool = typeof airlineValidationTool;


