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

type Params = {
  departure: Parameter<string>;
  arrival: Parameter<string>;
  date: Parameter<string>;
  passengers: Parameter<number>;
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
  return function <K extends keyof A>(key: K) {
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

const makeSpec = createSpecFactory<Params>();

// ─── Valid Spec Definition ────────────────────────────────

const specOf = {
  arrival: makeSpec("arrival")({
    requires: ['departure'] as const,
    influencedBy: ['date'] as const,
    fetchOptions: async (params: {departure: string; date?: string;}) => {
      // { departure: string; date?: string }
      return ['option'];
    }
  }),
  departure: makeSpec("departure")({
    requires: [] as const,
    influencedBy: ['arrival'] as const,
    fetchOptions: async (params) => {
      // { arrival?: string }
      return ['option'];
    }
  }),
  date: makeSpec("date")({
    requires: ['departure', 'arrival'] as const,
    influencedBy: ['passengers'] as const,
    fetchOptions: async (params) => {
      // { departure: string; arrival: string; passengers?: number }
      return ['option'];
    }
  }),
  passengers: makeSpec("passengers")({
    requires: ['departure', 'arrival', 'date'] as const,
    influencedBy: [] as const,
    fetchOptions: async (params) => {
      // { departure: string; arrival: string; date: string }
      return [1];
    }
  }),
};

// ─── Invalid Example (produces type error) ────────────────

const invalidSpec = {
  departure: makeSpec("departure")({
    requires: [] as const,
    influencedBy: ['arrival'] as const,
    // ❌ 'date' is not allowed here
    fetchOptions: async (params: { date: string }): Promise<string[]> => {
      return [];
    }
  }),
  arrival: makeSpec("arrival")({
    requires: ['departure'] as const,
    influencedBy: ['date'] as const,
    fetchOptions: async (params) => {
      return ['option'];
    }
  }),
  date: makeSpec("date")({
    requires: ['departure', 'arrival'] as const,
    influencedBy: ['passengers'] as const,
    fetchOptions: async (params) => {
      return ['option'];
    }
  }),
  passengers: makeSpec("passengers")({
    requires: ['departure', 'arrival', 'date'] as const,
    influencedBy: [] as const,
    fetchOptions: async (params) => {
      return [1];
    }
  }),
};
