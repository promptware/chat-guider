type ParameterState<A> =
  { tag: 'empty' } |
  { tag: 'provided', value: string } |
  { tag: 'specified', value: A };

type Parameter<A> = {
  state: ParameterState<A>,
  description: string;
};

type ParameterLabel<A> = keyof A;

type Refinement<A, K extends keyof A> =
  { tag: 'done' } |
  { tag: 'provide', parameter: K, options: A[K] };

async function refine<A, K extends keyof A> (
  params: A
): Promise<Refinement<A, K>> {
  return { tag: 'done' }
}

type Params = {
  departure: Parameter<string>;
  arrival: Parameter<string>;
  date: Parameter<string>;
  passengers: Parameter<number>;
};

type FetchOptionsParams<
  A,
  R extends keyof A,
  I extends keyof A
> = {
  [P in R]: A[P] extends Parameter<infer U> ? U : never;
} & {
  [P in I]?: A[P] extends Parameter<infer U> ? U : never;
};

type ParamSpec<
  A,
  K extends keyof A,
  T,
  R extends Exclude<keyof A, K>,
  I extends Exclude<keyof A, K>
> = {
  requires: R[];
  influencedBy: I[];
  fetchOptions: (params: FetchOptionsParams<A, R, I>) => Promise<T[]>;
};

type Spec<A extends Record<string, Parameter<any>>> = {
  [K in keyof A]: A[K] extends Parameter<infer T>
    ? // We leave R and I generic so that when you write an object literal their
      // literal types are inferred.
      ParamSpec<A, K, T, Exclude<keyof A, K>, Exclude<keyof A, K>>
    : never;
};

const specOf: Spec<Params> = {
  arrival: {
    requires: ['departure'] as const,
    influencedBy: ['date'] as const,
    fetchOptions: async (params: { departure: string; passengers: number; date?: string }): Promise<string[]> => {
      return [];
    }
  },
  departure: {
    requires: [] as const,
    influencedBy: ['arrival'] as const,
    fetchOptions: async (params: { date: string }): Promise<string[]> => {
      return [];
    }
  },
  date: {
    requires: ['departure', 'arrival'] as const,
    influencedBy: ['passengers'] as const,
    fetchOptions: async (params: { departure: string; arrival: string; passengers: number }): Promise<string[]> => {
      return [];
    }
  },
  passengers: {
    requires: ['departure', 'arrival', 'date'] as const,
    influencedBy: [] as const,
    fetchOptions: async (params: { departure: string; arrival: string; date: string }): Promise<number[]> => {
      return [];
    }
  }
};
