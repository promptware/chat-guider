// index.ts

// ─── Core Types ───────────────────────────────────────────

type ParameterState<A> =
  | { tag: 'empty' }
  | { tag: 'provided'; value: string }
  | { tag: 'specified'; value: A };

type Parameter<A> = {
  state: ParameterState<A>;
  description: string;
};

// ─── Helper Types ─────────────────────────────────────────

type LiteralKeys<T extends readonly (string | number | symbol)[]> = T[number];

type FetchOptionsParams<
  A,
  R extends keyof A,
  I extends keyof A
> = {
  [P in R]-?: A[P] extends Parameter<infer U> ? U : never;
} & {
  [P in I]?: A[P] extends Parameter<infer U> ? U : never;
};

// ─── Factory ──────────────────────────────────────────────

function createSpecFactory<A extends Record<string, Parameter<any>>>() {
  return function <K extends keyof A>(_key: K) {
    return function <
      R extends readonly (Exclude<keyof A, K>)[],
      I extends readonly (Exclude<keyof A, K>)[]
    >(entry: {
      requires: R;
      influencedBy: I;
      fetchOptions: (
        params: FetchOptionsParams<A, LiteralKeys<R>, LiteralKeys<I>>
      ) => Promise<A[K] extends Parameter<infer T> ? T[] : never>;
    }) {
      return entry;
    };
  };
}

// ─── Valid Spec Definition ────────────────────────────────

type Params = {
  departure: Parameter<string>;
  arrival: Parameter<string>;
  date: Parameter<string>;
  passengers: Parameter<number>;
};

const entries = [
  { departure: "London", arrival: "New York", date: "2026-10-01", seats: 100 },
  { departure: "London", arrival: "New York", date: "2026-10-02", seats: 1 },
  { departure: "Berlin", arrival: "New York", date: "2026-10-03", seats: 2 },
  { departure: "Berlin", arrival: "London", date: "2026-10-04", seats: 2 },
];

const makeSpec = createSpecFactory<Params>();

const specOf = {
  arrival: makeSpec("arrival")({
    requires: ['departure'],
    influencedBy: ['date'],
    fetchOptions: async (filters: {departure: string; date?: string;}) => {
      return entries.filter(
        entry =>
          filters.departure === entry.departure && (typeof filters.date === 'undefined' ? true : entry.date === filters.date)
      ).map(entry => entry.arrival);
    }
  }),
  departure: makeSpec("departure")({
    requires: [],
    influencedBy: ['arrival'],
    fetchOptions: async (params) => {
      // { arrival?: string }
      return ['option'];
    }
  }),
  date: makeSpec("date")({
    requires: ['departure', 'arrival'],
    influencedBy: ['passengers'],
    fetchOptions: async (params) => {
      // { departure: string; arrival: string; passengers?: number }
      return ['option'];
    }
  }),
  passengers: makeSpec("passengers")({
    requires: ['departure', 'arrival', 'date'],
    influencedBy: [],
    fetchOptions: async (params) => {
      // { departure: string; arrival: string; date: string }
      return [1];
    }
  }),
};

// ─── Invalid Example (produces type error) ────────────────

const invalidSpec = {
  departure: makeSpec("departure")({
    requires: [],
    influencedBy: ['arrival'],
    // ❌ 'date' is not allowed here
    fetchOptions: async (params: { date: string }): Promise<string[]> => {
      return [];
    }
  }),
  arrival: makeSpec("arrival")({
    requires: ['departure'],
    influencedBy: ['date'],
    fetchOptions: async (params) => {
      return ['option'];
    }
  }),
  date: makeSpec("date")({
    requires: ['departure', 'arrival'],
    influencedBy: ['passengers'],
    fetchOptions: async (params) => {
      return ['option'];
    }
  }),
  passengers: makeSpec("passengers")({
    requires: ['departure', 'arrival', 'date'],
    influencedBy: [],
    fetchOptions: async (params) => {
      return [1];
    }
  }),
};
