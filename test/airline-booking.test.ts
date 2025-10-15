import { expect } from 'chai';
import { describe, it } from 'mocha';
import z from 'zod';
import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { mkTool } from '../src/mk-tool.js';
import 'dotenv/config';
import { AirlineSchedule, FlightFilters } from './airline-schedule.js';

const uniq = <T,>(values: T[]): T[] => Array.from(new Set(values));

const AirlineBookingSchema = z.object({
  departure: z.string().min(1),
  arrival: z.string().min(1),
  date: z.string().min(1),
  passengers: z.number().min(1),
});

const AirlineBookingForLLMSchema = z.object({
  departure: z.string().optional().describe('City of departure, if known'),
  arrival: z.string().optional().describe('City of arrival, if known'),
  date: z.string().optional().describe('Date of departure, if known'),
  passengers: z.number().optional().describe('Number of passengers, if known'),
});

type AirlineBookingForLLM = z.infer<typeof AirlineBookingForLLMSchema>;

type AirlineBooking = z.infer<typeof AirlineBookingSchema>;


describe('mkTool airline tool', () => {
  it('executes and returns accepted value', async function () {
    this.timeout(100000);
    const schedule = new AirlineSchedule([
      { departure: 'london', arrival: 'New York', date: '2026-10-01', seats: 100 },
      { departure: 'london', arrival: 'NEW_YORK', date: '2026-10-02', seats: 2 },
      { departure: 'Berlin', arrival: 'New York', date: '2026-10-03', seats: 2 },
      { departure: 'Berlin', arrival: 'London', date: '2026-10-04', seats: 2 },
      { departure: 'Paris', arrival: 'Tokyo', date: '2026-10-05', seats: 50 },
      { departure: 'New York', arrival: 'Los Angeles', date: '2026-10-06', seats: 25 },
    ]);
    const responseReceivedController = new AbortController();
    let executeCalledWith: AirlineBooking | null = null;
    const airlineValidationTool = mkTool<AirlineBooking, typeof AirlineBookingForLLMSchema, typeof AirlineBookingSchema>({
      schema: AirlineBookingSchema,
      toolSchema: AirlineBookingForLLMSchema,
      outputSchema: AirlineBookingSchema,
      description: 'Validate and compute options for airline booking parameters.',
      execute: async (input: AirlineBooking) => {
        executeCalledWith = input;
        responseReceivedController.abort();
        return input;
      },
    })
      .field('departure', {
        requires: [],
        influencedBy: ['arrival'],
        description: 'City of departure',
        validate: async (value: string | undefined, context: { arrival?: string }) => {
          const filter: FlightFilters = context;
          const availableFlights = schedule.getAvailableFlights(filter);
          const allowedOptions = uniq(availableFlights.map(e => e.departure));
          if (allowedOptions.some(departure => departure === value)) {
            return { allowedOptions, isValid: true, normalizedValue: value };
          }
          return { allowedOptions, isValid: false, refusalReason: 'no matching options' };
        },
      })
      .field('arrival', {
        requires: ['departure'],
        influencedBy: ['date'],
        description: 'City of arrival',
        validate: async (value: string | undefined, context: { departure: string; date?: string }) => {
          const filter: FlightFilters = context;
          const availableFlights = schedule.getAvailableFlights(filter);
          const allowedOptions = uniq(availableFlights.map(e => e.arrival));
          if (allowedOptions.some(arrival => arrival === value)) {
            return { allowedOptions, isValid: true, normalizedValue: value };
          }
          return { allowedOptions, isValid: false, refusalReason: 'no matching options' };
        },
      })
      .field('date', {
        requires: ['departure','arrival'],
        influencedBy: ['passengers'],
        description: 'Date of departure',
        validate: async (value: string | undefined, context: { departure: string; arrival: string; passengers?: number }) => {
          const filter: FlightFilters = context;
          const availableFlights = schedule.getAvailableFlights(filter);
          const allowedOptions = uniq(availableFlights.map(e => e.date));
          if (allowedOptions.some(date => date === value)) {
            return { allowedOptions, isValid: true, normalizedValue: value };
          }
          return { allowedOptions, isValid: false, refusalReason: 'no matching options' };
        },
      })
      .field('passengers', {
        requires: ['departure','arrival','date'],
        influencedBy: [],
        description: 'Number of passengers',
        validate: async (value: number | undefined, context: { departure: string; arrival: string; date: string }) => {
          const filter: FlightFilters = context;
          const availableFlights = schedule.getAvailableFlights(filter);
          if (typeof value !== 'number') {
            return { isValid: false, refusalReason: 'need a number of passengers' };
          }
          const max = Math.max(0, ...availableFlights.map(e => e.seats));
          if (value > max) {
            return { isValid: false, refusalReason: 'not enough seats available (max is ' + max + ')' };
          }
          return { isValid: true, normalizedValue: value };
        },
      })
      .build();

    try {
      const result = await generateText({
        model: createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! })('openai/gpt-5'),
        tools: { airlineValidationTool },
        toolChoice: 'auto',
        abortSignal: responseReceivedController.signal,
        stopWhen: ({ steps }) => steps.length > 5,
        prompt: `Book a flight from London to New York for two passengers on 2026 October 2nd if you can.
  Do not choose closest options. Only exact SEMANTIC matching is allowed.
  Use tools. try calling tools until you get a successful tool response.
  If you get a rejection, pay attention to the response validation and rejection reasons and retry.
    `,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // expected
      } else {
        throw error;
      }
    }
    const expectedFlight: AirlineBooking = { departure: 'london', arrival: 'NEW_YORK', date: '2026-10-02', passengers: 2 };
    expect(executeCalledWith).to.deep.equal(expectedFlight);
  });
});


