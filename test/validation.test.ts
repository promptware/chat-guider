import { expect } from 'chai';
import { describe, it } from 'mocha';
import { defineValidationSpec, compileFixup } from '../src/validation.js';

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

const spec = defineValidationSpec<Airline>()({
  departure: {
    requires: [],
    influencedBy: ['arrival'],
    description: 'City of departure',
    validate: async (value: string | undefined, context: { arrival?: string }) => {
      const filtered = entries.filter(e =>
        context.arrival ? e.arrival === context.arrival : true,
      );
      const allowed = uniq(filtered.map(e => e.departure));
      const normalized = typeof value === 'string' ? value : undefined;
      if (normalized === undefined) return { allowedOptions: allowed };
      if (!allowed.some(v => Object.is(v, normalized)))
        return { allowedOptions: allowed, isValid: false, refusalReason: 'no matching options' };
      return { allowedOptions: allowed, isValid: true, normalizedValue: normalized };
    },
  },
  arrival: {
    requires: ['departure'],
    influencedBy: ['date'],
    description: 'City of arrival',
    validate: async (value: string | undefined, context: { departure: string; date?: string }) => {
      const filtered = entries.filter(
        e => e.departure === context.departure && (context.date ? e.date === context.date : true),
      );
      const allowed = uniq(filtered.map(e => e.arrival));
      const normalized = typeof value === 'string' ? value : undefined;
      if (normalized === undefined) return { allowedOptions: allowed };
      if (!allowed.some(v => Object.is(v, normalized)))
        return { allowedOptions: allowed, isValid: false, refusalReason: 'no matching options' };
      return { allowedOptions: allowed, isValid: true, normalizedValue: normalized };
    },
  },
  date: {
    requires: ['departure', 'arrival'],
    influencedBy: ['passengers'],
    description: 'Date of departure',
    validate: async (
      value: string | undefined,
      context: { departure: string; arrival: string; passengers?: number },
    ) => {
      const filtered = entries.filter(
        e =>
          e.departure === context.departure &&
          e.arrival === context.arrival &&
          (context.passengers ? e.seats >= context.passengers : true),
      );
      const allowed = uniq(filtered.map(e => e.date));
      const normalized = typeof value === 'string' ? value : undefined;
      if (normalized === undefined) return { allowedOptions: allowed };
      if (!allowed.some(v => Object.is(v, normalized)))
        return { allowedOptions: allowed, isValid: false, refusalReason: 'no matching options' };
      return { allowedOptions: allowed, isValid: true, normalizedValue: normalized };
    },
  },
  passengers: {
    requires: ['departure', 'arrival', 'date'],
    influencedBy: [],
    description: 'Number of passengers',
    validate: async (
      value: number | undefined,
      context: { departure: string; arrival: string; date: string },
    ) => {
      const filtered = entries.filter(
        e =>
          e.departure === context.departure &&
          e.arrival === context.arrival &&
          e.date === context.date,
      );
      const allowed = uniq(filtered.map(e => e.seats));
      const rawNum = typeof value === 'string' ? Number(value) : value;
      const normalized =
        typeof rawNum === 'number' && Number.isFinite(rawNum) && rawNum > 0 ? rawNum : undefined;
      if (normalized === undefined) return { allowedOptions: allowed };
      const max = Math.max(0, ...allowed.map(o => Number(o)));
      if (normalized > max)
        return { allowedOptions: allowed, isValid: false, refusalReason: 'not enough seats' };
      return { allowedOptions: allowed, isValid: true, normalizedValue: normalized };
    },
  },
});

describe('validation.compileFixup', () => {
  it('rejects when fields are missing and provides allowedOptions', async () => {
    const fixup = compileFixup(spec);
    const res = await fixup({});
    const expected = {
      tag: 'rejected' as const,
      validationResults: {
        departure: { valid: false, allowedOptions: ['London', 'Berlin', 'Paris', 'New York'] },
        arrival: { valid: false, refusalReason: 'requires a valid departure first' },
        date: { valid: false, refusalReason: 'requires a valid departure, arrival first' },
        passengers: {
          valid: false,
          refusalReason: 'requires a valid departure, arrival, date first',
        },
      },
    };
    expect(res).to.deep.equal(expected);
  });

  it('rejects invalid dependent value with filtered allowedOptions (arrival given departure)', async () => {
    const fixup = compileFixup(spec);
    const res = await fixup({ departure: 'London', arrival: 'Tokyo' });
    const expected = {
      tag: 'rejected' as const,
      validationResults: {
        departure: { valid: true, allowedOptions: ['London', 'Berlin', 'Paris', 'New York'] },
        arrival: {
          valid: false,
          refusalReason: 'no matching options',
          allowedOptions: ['New York'],
        },
        date: { valid: false, refusalReason: 'requires a valid arrival first' },
        passengers: { valid: false, refusalReason: 'requires a valid arrival, date first' },
      },
    };
    expect(res).to.deep.equal(expected);
  });

  it('rejects with allowed options when date invalid and passengers too large for available seats', async () => {
    const fixup = compileFixup(spec);
    const res = await fixup({
      departure: 'London',
      arrival: 'New York',
      date: '2026-10-02',
      passengers: 5,
    });
    const expected = {
      tag: 'rejected' as const,
      validationResults: {
        departure: { valid: true, allowedOptions: ['London', 'Berlin', 'Paris', 'New York'] },
        arrival: { valid: true, allowedOptions: ['New York'] },
        date: { valid: true, allowedOptions: ['2026-10-01', '2026-10-02'] },
        passengers: { valid: false, refusalReason: 'not enough seats', allowedOptions: [1] },
      },
    };
    expect(res).to.deep.equal(expected);
  });

  it('accepts a valid full selection', async () => {
    const fixup = compileFixup(spec);
    const res = await fixup({
      departure: 'Berlin',
      arrival: 'London',
      date: '2026-10-04',
      passengers: 2,
    });
    const expected = {
      tag: 'accepted' as const,
      value: { departure: 'Berlin', arrival: 'London', date: '2026-10-04', passengers: 2 },
    };
    expect(res).to.deep.equal(expected);
  });

  it('options are always included even when rejected', async () => {
    const fixup = compileFixup(spec);
    const res = await fixup({ departure: 'Paris', passengers: 1000 });
    const expected = {
      tag: 'rejected' as const,
      validationResults: {
        departure: { valid: true, allowedOptions: ['London', 'Berlin', 'Paris', 'New York'] },
        arrival: { valid: false, allowedOptions: ['Tokyo'] },
        date: { valid: false, refusalReason: 'requires a valid arrival first' },
        passengers: { valid: false, refusalReason: 'requires a valid arrival, date first' },
      },
    };
    expect(res).to.deep.equal(expected);
  });
});
