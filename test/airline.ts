import z from 'zod';
import { mkTool } from '../src/mk-tool.js';
import { AirlineSchedule, FlightEntry, FlightFilters } from './airline-schedule.js';
import { uniq } from './utils.js';

// Our domain type for airline bookings. All fields are required.
export const AirlineBookingSchema = z.object({
  departure: z.string().min(1),
  arrival: z.string().min(1),
  date: z.string().min(1),
  passengers: z.number().min(1),
});

// Type for the LLM tool input schema. All fields are optional.
export const AirlineBookingForLLMSchema = z.object({
  departure: z.string().optional().describe('City of departure, if known'),
  arrival: z.string().optional().describe('City of arrival, if known'),
  date: z.string().optional().describe('Date of departure, if known'),
  passengers: z.number().optional().describe('Number of passengers, if known'),
});

export type AirlineBookingForLLM = z.infer<typeof AirlineBookingForLLMSchema>;

export type AirlineBooking = z.infer<typeof AirlineBookingSchema>;

// Create a tool to book a flight from a pre-defined list.
export const mkAirlineBookingTool = (
  flights: FlightEntry[],
  // callback used for testing purposes
  execute: (input: AirlineBooking) => Promise<AirlineBooking>,
) => {
  const schedule = new AirlineSchedule(flights);
  // Abort controller to kill LLM inference as soon as we get the response and save some tokens
  const responseReceivedController = new AbortController();
  // Here we define our tool using a builder:
  return (
    mkTool<AirlineBooking, typeof AirlineBookingForLLMSchema, typeof AirlineBookingSchema>({
      schema: AirlineBookingSchema,
      toolSchema: AirlineBookingForLLMSchema,
      // Our tool returns the same domain type that we use for input - it just logs the value.
      outputSchema: AirlineBookingSchema,
      description: 'Airline booking tool.',
      execute: async (input: AirlineBooking) => {
        execute(input);
        // stop the inference
        responseReceivedController.abort();
        return input;
      },
    })
      // Begin describing our tool interface:
      .field('departure', {
        // `requires` field introduces dependencies between fields.
        // It is reasonable to assume that the first thing we want to know is WHERE we are going to fly from
        requires: [],
        // `influencedBy` introduces "optional dependencies":
        // If we know the arrival, we can narrow the scope of possible departures.
        // But if we don't, we can still offer some options.
        influencedBy: ['arrival'],
        description: 'City of departure',
        // This is the core of our logic.
        // Arguments:
        // - `value`: either departure string if provided, or nothing if the user did not pass it.
        // - `context`: an object with the fields that are already known to the LLM.
        //   - `arrival`: the city of arrival, if known. We put it in influencedBy, hence it is an optional argument.
        //
        // The type-level machinery provides us some static checks.
        // Try making `arrival` argument non-optional below, and notice the type error.
        validate: async (value: string | undefined, context: { arrival?: string }) => {
          // We have a convenience utility to give us available flights for given filters.
          const filter: FlightFilters = context;
          const availableFlights = schedule.getAvailableFlights(filter);
          // We compute all available options for the field value.
          const allowedOptions = uniq(availableFlights.map(e => e.departure));
          if (allowedOptions.some(departure => departure === value)) {
            // If the value matches one of the options, it is VALID.
            return { allowedOptions, valid: true };
          }
          // Otherwise, we fail, but provide the options for the LLM to reflect on.
          return { allowedOptions, valid: false };
        },
      })
      .field('arrival', {
        requires: ['departure'],
        influencedBy: ['date'],
        description: 'City of arrival',
        validate: async (
          value: string | undefined,
          context: { departure: string; date?: string },
        ) => {
          const filter: FlightFilters = context;
          const availableFlights = schedule.getAvailableFlights(filter);
          const allowedOptions = uniq(availableFlights.map(e => e.arrival));
          if (allowedOptions.some(arrival => arrival === value)) {
            return { allowedOptions, valid: true, normalizedValue: value };
          }
          return { allowedOptions, valid: false, refusalReason: 'no matching options' };
        },
      })
      .field('date', {
        requires: ['departure', 'arrival'],
        influencedBy: ['passengers'],
        description: 'Date of departure',
        validate: async (
          value: string | undefined,
          context: { departure: string; arrival: string; passengers?: number },
        ) => {
          const filter: FlightFilters = context;
          const availableFlights = schedule.getAvailableFlights(filter).filter(
            // we can filter out flights that do not have enough seats for the given number of passengers.
            e => e.seats >= (context.passengers ?? 0),
          );
          const allowedOptions = uniq(availableFlights.map(e => e.date));
          if (allowedOptions.some(date => date === value)) {
            return { allowedOptions, valid: true };
          }
          return { allowedOptions, valid: false };
        },
      })
      .field('passengers', {
        requires: ['departure', 'arrival', 'date'],
        influencedBy: [],
        description: 'Number of passengers',
        validate: async (
          value: number | undefined,
          context: { departure: string; arrival: string; date: string },
        ) => {
          const filter: FlightFilters = context;
          const availableFlights = schedule.getAvailableFlights(filter);
          // There are multiple flights available, so we need to check if NONE of them have that number of seats.
          const max = Math.max(0, ...availableFlights.map(e => e.seats));
          if (typeof value !== 'undefined') {
            if (value > max) {
              return {
                valid: false,
                refusalReason: `not enough seats available (${value} passengers, max is ${max})`,
              };
            } else {
              return { valid: true as const };
            }
          }
          return { valid: false as const };
        },
      })
      // Finally, we call build() that ensures we have provided specs for all fields.
      .build()
  );
};
