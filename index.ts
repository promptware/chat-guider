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

type ParamSpec<
  A,
  K extends keyof A,
  R extends readonly (Exclude<keyof A, K>)[],
  I extends readonly (Exclude<keyof A, K>)[]
> = {
  requires: R;
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

type Spec<A extends Record<string, Parameter<any>>> = {
  [K in keyof A]: A[K] extends Parameter<infer _>
    ? ParamSpec<A, K, Exclude<keyof A, K>[], Exclude<keyof A, K>[]>
    : never;
};

const spec: Spec<Params> = {
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
    requires: ["arrival"],
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

console.log(spec, detectRequiresCycles(spec));

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
