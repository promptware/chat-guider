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
const okFeedbackRejected: Feedback = { tag: 'rejected', reasons: [
  { field: 'departure', allowedOptions: ['x','y'] },
  { field: 'passengers', allowedOptions: [1,2], refusalReason: 'too many' },
] };

// @ts-expect-error passengers allowedOptions must be number[]
const badFeedbackPassengers: Feedback = { tag: 'rejected', reasons: [ { field: 'passengers', allowedOptions: ['1'] } ] };

// @ts-expect-error departure allowedOptions must be string[]
const badFeedbackDeparture: Feedback = { tag: 'rejected', reasons: [ { field: 'departure', allowedOptions: [1] } ] };
