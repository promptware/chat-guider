import { expect } from 'chai';
import { describe, it } from 'mocha';
import { compileFixup, toposortFields, ToolSpec } from '../src/validation.js';
import { ToolCallRejected } from '../src/validation.js';
import { HiddenSpecSymbol } from '../src/builder.js';
import { mkAirlineBookingTool } from './airline.js';

type Airline = {
  departure: string;
  arrival: string;
  date: string;
  passengers: number;
};

const entries = [
  { departure: 'London', arrival: 'New York', date: '2026-10-01', seats: 100 },
  { departure: 'London', arrival: 'New York', date: '2026-10-02', seats: 1 },
  { departure: 'Berlin', arrival: 'New York', date: '2026-10-03', seats: 2 },
  { departure: 'Berlin', arrival: 'London', date: '2026-10-04', seats: 2 },
  { departure: 'Paris', arrival: 'Tokyo', date: '2026-10-05', seats: 50 },
  { departure: 'New York', arrival: 'Los Angeles', date: '2026-10-06', seats: 25 },
];

const uniq = <T>(xs: T[]) => Array.from(new Set(xs));

const tool = mkAirlineBookingTool(entries, async input => {
  return input;
});

const spec = (tool as any)[HiddenSpecSymbol] as ToolSpec<Airline>;

describe('validation.unit.test.ts', () => {
  it('#1 compileFixup rejects when fields are missing and provides allowedOptions', async () => {
    const fixup = compileFixup(spec);
    const res = await fixup({});
    const expected: ToolCallRejected<Airline> = {
      status: 'rejected',
      validationResults: {
        departure: { valid: false, allowedOptions: ['London', 'Berlin', 'Paris', 'New York'] },
        arrival: { valid: false, needsValidFields: ['departure'] },
        date: { valid: false, needsValidFields: ['departure', 'arrival'] },
        passengers: { valid: false, needsValidFields: ['departure', 'arrival', 'date'] },
      },
    };
    expect(res).to.deep.equal(expected);
  });

  it('#2 rejects invalid dependent value with filtered allowedOptions (arrival given departure)', async () => {
    const fixup = compileFixup(spec);
    const res = await fixup({ departure: 'London', arrival: 'Tokyo' });
    console.log(JSON.stringify(toposortFields(spec), null, 2));
    const expected: ToolCallRejected<Airline> = {
      status: 'rejected',
      validationResults: {
        departure: { valid: true, allowedOptions: ['London', 'Berlin', 'Paris', 'New York'] },
        arrival: {
          valid: false,
          allowedOptions: ['New York'],
          refusalReason: 'no matching options',
        },
        date: { valid: false, needsValidFields: ['arrival'] },
        passengers: { valid: false, needsValidFields: ['arrival', 'date'] },
      },
    };
    expect(res).to.deep.equal(expected);
  });

  it('#3 rejects with allowed options when date invalid and passengers too large for available seats', async () => {
    const fixup = compileFixup(spec);
    const res = await fixup({
      departure: 'London',
      arrival: 'New York',
      date: '2026-10-02',
      passengers: 5,
    });
    const expected = {
      status: 'rejected' as const,
      validationResults: {
        departure: { valid: true, allowedOptions: ['London', 'Berlin', 'Paris', 'New York'] },
        arrival: { valid: true, allowedOptions: ['New York'] },
        date: { valid: true, allowedOptions: ['2026-10-01', '2026-10-02'] },
        passengers: {
          valid: false,
          refusalReason: 'not enough seats available (5 passengers, max is 1)',
        },
      },
    };
    expect(res).to.deep.equal(expected);
  });

  it('#4 accepts a valid full selection', async () => {
    const fixup = compileFixup(spec);
    const res = await fixup({
      departure: 'Berlin',
      arrival: 'London',
      date: '2026-10-04',
      passengers: 2,
    });
    const expected = {
      status: 'accepted' as const,
      value: { departure: 'Berlin', arrival: 'London', date: '2026-10-04', passengers: 2 },
    };
    expect(res).to.deep.equal(expected);
  });

  it('#5 options are always included even when rejected', async () => {
    const fixup = compileFixup(spec);
    const res = await fixup({ departure: 'Paris', passengers: 1000 });
    const expected = {
      status: 'rejected' as const,
      validationResults: {
        departure: { valid: true, allowedOptions: ['London', 'Berlin', 'Paris', 'New York'] },
        arrival: { valid: false, allowedOptions: ['Tokyo'], refusalReason: 'no matching options' },
        date: { valid: false, needsValidFields: ['arrival'] },
        passengers: { valid: false, needsValidFields: ['arrival', 'date'] },
      },
    };
    expect(res).to.deep.equal(expected);
  });
});
