import _ from 'lodash';
import util from "util";

async function log(...args: unknown[]) {
  console.log(
    args
      .map((arg) =>
        typeof arg === "string"
          ? arg
          : util.inspect(arg, { depth: null, colors: true }),
      )
      .join(" "),
  );
}

// ─── Core Types ───────────────────────────────────────────

type ParameterState<A> =
  | { tag: 'empty' }
  | { tag: 'provided'; value: string }
  | { tag: 'specified'; value: A };

type ParameterOptions<A> =
  | { tag: 'unknown' }
  | { tag: 'available'; variants: { id: string; value: A; }[] };

type Parameter<A> = {
  state: ParameterState<A>;
  options: ParameterOptions<A>;
};

// ─── Helper Types ─────────────────────────────────────────

type LiteralKeys<T extends (string | number | symbol)[]> = T[number];

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
  R extends (Exclude<keyof A, K>)[],
  I extends (Exclude<keyof A, K>)[]
> = {
  requires: R;
  description: string;
  influencedBy: I;
  fetchOptions: (
    params: FetchOptionsParams<A, LiteralKeys<R>, LiteralKeys<I>>
  ) => Promise<
    A[K] extends Parameter<infer T>
    ? { value: T; id: string;}[]
    : never
    >;
}

function makeSpec<
  A extends Record<K, Parameter<any>>,
  K extends keyof A,
  R extends (Exclude<keyof A, K>)[],
  I extends (Exclude<keyof A, K>)[],
  >(_key: K, entry: ParamSpec<A, K, R, I>): ParamSpec<A, K, R, I> {
    return entry;
};

function makeParameter<
  A extends Record<K, Parameter<A[K]>>,
  K extends keyof A,
  >(_key: K): Parameter<A[K]> {
    const ak: Parameter<A[K]> = {
      state: { tag: 'empty' },
      options: { tag: 'unknown' }
    };
    return ak;
};

export async function initParams<A extends Record<string, Parameter<any>>>(
  spec: Spec<A>
): Promise<A> {
  const params = {} as A;
  for (const key of Object.keys(spec) as Array<keyof A>) {
    params[key] = makeParameter<A, typeof key>(key) as A[typeof key];
    if (spec[key].requires.length === 0) {
      params[key].options = {
        tag: 'available',
        variants: await spec[key].fetchOptions({} as {
          [P in keyof A]-?: never
        })
      }
    }
  }
  return params;
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


export async function flowLoop<A extends Record<string, Parameter<any>>>(spec: Spec<A>, params: A): Promise<void> {
  // if every parameter is specified,
  // dispatch

  // find parameters to ask about

  // if there are some, ask

  // if there are none, check that every parameter is provided
  // if every parameter is provided,
}


export async function runFlow<T extends Record<string, any>>(spec: Spec<T>): Promise<void> {
  const cycles = detectRequiresCycles(spec);
  if (cycles.length) {
    throw new Error(`Your spec contains a cycle: ${cycles[0].join(' -> ')}`);
  }

  let params: T = await initParams(spec);
  log('initialParams', params);

  while (true) {
    await flowLoop(spec, params);
  }

  // find the ONLY field that does not require anything (throw if more than one)
  //
}

// ─── Valid Spec Definition ────────────────────────────────

type Params = {
  departure: Parameter<string>;
  arrival: Parameter<string>;
  date: Parameter<string>;
  passengers: Parameter<number>;
};

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

// parameter is an action!
// parameters must be dynamic (turn on and off depending on context)

type Agent = {
  description: "",
  actions: {
    "book_flight": {
      spec: Spec<Params>;
      description: string;
    },
    "book_hotel": {
    }
  },
};

const spec: Spec<Params> = {
  arrival: makeSpec("arrival", {
    description: "City of arrival",
    requires: ['departure'],
    influencedBy: ['date'],
    fetchOptions: async (filters: { departure: string; date?: string }) => {
      const matches = entries.filter(entry =>
        entry.departure === filters.departure &&
        (filters.date ? entry.date === filters.date : true)
      );
      return _.uniq(matches.map(e => e.arrival)).map(value => ({ value, id: value }));
    }
  }),

  departure: makeSpec("departure", {
    description: "City of departure",
    requires: [],
    influencedBy: ['arrival'],
    fetchOptions: async (filters: { arrival?: string }) => {
      const matches = entries.filter(entry =>
        (filters.arrival ? entry.arrival === filters.arrival : true)
      );
      return _.uniq(matches.map(e => e.departure)).map(value => ({ value, id: value }));
    }
  }),

  date: makeSpec("date", {
    description: "Date of departure",
    requires: ['departure', 'arrival'],
    influencedBy: ['passengers'],
    fetchOptions: async (filters: {
      departure: string;
      arrival: string;
      passengers?: number;
    }) => {
      const matches = entries.filter(
        entry =>
          entry.departure === filters.departure &&
          entry.arrival === filters.arrival &&
          (filters.passengers ? entry.seats >= filters.passengers : true)
      );
      return _.uniq(matches.map(e => e.date)).map(value => ({ value, id: value }));
    }
  }),

  passengers: makeSpec("passengers", {
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
      return _.uniq(matches.map(e => e.seats)).map(value => ({
        value: value,
        id: value.toString()
      }));
    }
  }),
};

console.log(spec, detectRequiresCycles(spec));

runFlow(spec);
