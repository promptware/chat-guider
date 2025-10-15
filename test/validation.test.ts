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

const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));

const spec = defineValidationSpec<Airline>()({
  departure: {
    requires: [],
    influencedBy: ['arrival'],
    description: 'City of departure',
    fetchOptions: async (filters) => {
      const filtered = entries.filter(e => (filters.arrival ? e.arrival === filters.arrival : true));
      return uniq(filtered.map(e => e.departure));
    }
  },
  arrival: {
    requires: ['departure'],
    influencedBy: ['date'],
    description: 'City of arrival',
    fetchOptions: async (filters) => {
      const filtered = entries.filter(e =>
        e.departure === filters.departure &&
        (filters.date ? e.date === filters.date : true)
      );
      return uniq(filtered.map(e => e.arrival));
    }
  },
  date: {
    requires: ['departure', 'arrival'],
    influencedBy: ['passengers'],
    description: 'Date of departure',
    fetchOptions: async (filters) => {
      const filtered = entries.filter(e =>
        e.departure === filters.departure &&
        e.arrival === filters.arrival &&
        (filters.passengers ? e.seats >= filters.passengers : true)
      );
      return uniq(filtered.map(e => e.date));
    }
  },
  passengers: {
    requires: ['departure', 'arrival', 'date'],
    influencedBy: [],
    description: 'Number of passengers',
    normalize: (raw) => {
      const n = typeof raw === 'string' ? Number(raw) : raw;
      return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
    },
    fetchOptions: async (filters) => {
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

describe('validation.compileFixup', () => {
  it('rejects when fields are missing and provides allowedOptions', async () => {
    const fixup = compileFixup(spec);
    const res = await fixup({});
    const expected = {
      tag: 'rejected' as const,
      validationResults: {
        departure: { valid: false, allowedOptions: ['London','Berlin','Paris','New York'] },
        arrival: { valid: false, refusalReason: 'requires a valid departure first' },
        date: { valid: false, refusalReason: 'requires a valid departure, arrival first' },
        passengers: { valid: false, refusalReason: 'requires a valid departure, arrival, date first' },
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
        departure: { valid: true, allowedOptions: ['London','Berlin','Paris','New York'] },
        arrival: { valid: false, refusalReason: 'no matching options', allowedOptions: ['New York'] },
        date: { valid: false, refusalReason: 'requires a valid arrival first' },
        passengers: { valid: false, refusalReason: 'requires a valid arrival, date first' },
      },
    };
    expect(res).to.deep.equal(expected);
  });

  it('rejects with allowed options when date invalid and passengers too large for available seats', async () => {
    const fixup = compileFixup(spec);
    const res = await fixup({ departure: 'London', arrival: 'New York', date: '2026-10-02', passengers: 5 });
    const expected = {
      tag: 'rejected' as const,
      validationResults: {
        departure: { valid: true, allowedOptions: ['London','Berlin','Paris','New York'] },
        arrival: { valid: true, allowedOptions: ['New York'] },
        date: { valid: true, allowedOptions: ['2026-10-01','2026-10-02'] },
        passengers: { valid: false, refusalReason: 'no matching options', allowedOptions: [1] },
      },
    };
    expect(res).to.deep.equal(expected);
  });

  it('accepts a valid full selection', async () => {
    const fixup = compileFixup(spec);
    const res = await fixup({ departure: 'Berlin', arrival: 'London', date: '2026-10-04', passengers: 2 });
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
        departure: { valid: true, allowedOptions: ['London','Berlin','Paris','New York'] },
        arrival: { valid: false, allowedOptions: ['Tokyo'] },
        date: { valid: false, refusalReason: 'requires a valid arrival first' },
        passengers: { valid: false, refusalReason: 'requires a valid arrival, date first' },
      },
    };
    expect(res).to.deep.equal(expected);
  });
});


