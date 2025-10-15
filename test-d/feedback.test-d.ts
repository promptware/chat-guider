import { ToolzyFeedback } from "../src/feedback.js";

type Airline = {
  departure: string;
  arrival: string;
  date: string;
  passengers: number;
};

// Tool feedback typing: per-field allowedOptions type safety
type Feedback = ToolzyFeedback<Airline, Airline>;
const okFeedbackAccepted: Feedback = { tag: 'accepted', value: { departure: 'a', arrival: 'b', date: 'd', passengers: 1 } };
const okFeedbackRejected: Feedback = { tag: 'rejected', validationResults: {
  departure: { valid: true, allowedOptions: ['x','y'] },
  arrival: { valid: true, allowedOptions: ['a','b'] },
  date: { valid: true, allowedOptions: ['d','e'] },
  passengers: { valid: true, allowedOptions: [1,2] },
} };

// @ts-expect-error passengers allowedOptions must be number[]
const badFeedbackPassengers: Feedback = { tag: 'rejected', validationResults: { departure: { valid: true }, arrival: { valid: true }, date: { valid: true }, passengers: { valid: true, allowedOptions: ['1'] } } };

// @ts-expect-error departure allowedOptions must be string[]
const badFeedbackDeparture: Feedback = { tag: 'rejected', validationResults: { passengers: { valid: true }, arrival: { valid: true }, date: { valid: true }, departure: { valid: true, allowedOptions: [1] } } };
