import _ from 'lodash';
// index.ts

// ─── Core Types ───────────────────────────────────────────

type ParameterState<A> =
  | { tag: 'empty' }
  | { tag: 'provided'; value: string }
  | { tag: 'specified'; value: A };

type Parameter<A> = {
  state: ParameterState<A>;
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

type ParamSpec<
  A,
  K extends keyof A,
  R extends readonly (Exclude<keyof A, K>)[],
  I extends readonly (Exclude<keyof A, K>)[]
> = {
  requires: R;
  description: string;
  influencedBy: I;
  fetchOptions: (
    params: FetchOptionsParams<A, LiteralKeys<R>, LiteralKeys<I>>
  ) => Promise<A[K] extends Parameter<infer T> ? T[] : never>;
}

function createSpecFactory<A extends Record<string, Parameter<any>>>() {
  return function <K extends keyof A>(_key: K) {
    return function <
      R extends readonly (Exclude<keyof A, K>)[],
      I extends readonly (Exclude<keyof A, K>)[]
      >(entry: ParamSpec<A, K, R, I>) {
      return entry;
    };
  };
}

function initParams<A extends Record<string, Parameter<any>>>(spec: Spec<A>): A {
  const res = {} as { [K in keyof A]: Parameter<any> };

  for (const key of Object.keys(spec) as (keyof A)[]) {
    res[key] = {
      state: { tag: 'empty' },
    };
  }

  return res as A;
}

function detectRequiresCycles<T extends Record<string, any>>(spec: Spec<T>): string[][] {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(node: string, path: string[]) {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node);
      cycles.push([...path.slice(cycleStart), node]);
      return;
    }

    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);

    const requires = spec[node]?.requires ?? [];
    for (const neighbor of requires) {
      // @ts-expect-error: may be a symbol or a number
      dfs(neighbor, [...path, node]);
    }

    inStack.delete(node);
  }

  for (const key of Object.keys(spec)) {
    dfs(key, []);
  }

  return cycles;
}

// ─── Valid Spec Definition ────────────────────────────────

type Params = {
  departure: Parameter<string>;
  arrival: Parameter<string>;
  date: Parameter<string>;
  passengers: Parameter<number>;
};

const makeSpec = createSpecFactory<Params>();

type Spec<A extends Record<string, Parameter<any>>> = {
  [K in keyof A]: A[K] extends Parameter<infer _>
    ? ParamSpec<A, K, Exclude<keyof A, K>[], Exclude<keyof A, K>[]>
    : never;
};

const entries = [
  { departure: "London", arrival: "New York", date: "2026-10-01", seats: 100 },
  { departure: "London", arrival: "New York", date: "2026-10-02", seats: 1 },
  { departure: "Berlin", arrival: "New York", date: "2026-10-03", seats: 2 },
  { departure: "Berlin", arrival: "London", date: "2026-10-04", seats: 2 },
];

const spec: Spec<Params> = {
  arrival: makeSpec("arrival")({
    description: "City of arrival",
    requires: ['departure'],
    influencedBy: ['date'],
    fetchOptions: async (filters: { departure: string; date?: string }) => {
      const matches = entries.filter(entry =>
        entry.departure === filters.departure &&
        (filters.date ? entry.date === filters.date : true)
      );
      return _.uniq(matches.map(e => e.arrival));
    }
  }),

  departure: makeSpec("departure")({
    description: "City of departure",
    requires: ['arrival'],
    influencedBy: ['arrival'],
    fetchOptions: async (filters: { arrival?: string }) => {
      const matches = entries.filter(entry =>
        (filters.arrival ? entry.arrival === filters.arrival : true)
      );
      return _.uniq(matches.map(e => e.departure));
    }
  }),

  date: makeSpec("date")({
    description: "Date of departure",
    requires: ['departure', 'arrival'],
    influencedBy: ['passengers'],
    fetchOptions: async (filters: {
      departure: string;
      arrival: string;
      passengers?: number;
    }) => {
      const matches = entries.filter(entry =>
        entry.departure === filters.departure &&
        entry.arrival === filters.arrival &&
        (filters.passengers ? entry.seats >= filters.passengers : true)
      );
      return _.uniq(matches.map(e => e.date));
    }
  }),

  passengers: makeSpec("passengers")({
    description: "Number of passengers",
    requires: ['departure', 'arrival', 'date'],
    influencedBy: [],
    fetchOptions: async (filters: {
      departure: string;
      arrival: string;
      date: string;
    }) => {
      const matches = entries.filter(entry =>
        entry.departure === filters.departure &&
        entry.arrival === filters.arrival &&
        entry.date === filters.date
      );
      return _.uniq(matches.map(e => e.seats));
    }
  }),
};

console.log(spec, detectRequiresCycles(spec));
