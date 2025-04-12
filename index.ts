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

const specOf = {
  arrival: {
    requires: ['departure'],
    influencedBy: ['date'],
    fetchOptions: async (params: { departure: string, date?: string }): Promise<string[]> => {
      return [];
    }
  },
  departure: {
    requires: [],
    influencedBy: ['arrival'],
    fetchOptions: async (params: { arrival?: string }): Promise<string[]> => {
      return [];
    }
  },
  date: {
    requires: ['departure', 'arrival'],
    influencedBy: ['passengers'],
    fetchOptions: async (params: { departure: string, arrival: string, passengers: number }): Promise<string[]> => {
      return [];
    }
  },
  passengers: {
    requires: ['departure', 'arrival', 'date'],
    influencedBy: [],
    fetchOptions: async (params: { departure: string, arrival: string, date: string }): Promise<string[]> => {
      return [];
    }
  }
}

type ParamSpec<A, K, T> = {
  requires: Exclude<keyof A, K>[];
  influencedBy: Exclude<keyof A, K>[];
  fetchOptions: () => Promise<T[]>;
};

type Spec<A extends Record<string, Parameter<any>>> = {
  [K in keyof A]: A[K] extends Parameter<infer T> ? ParamSpec<A, K, T> : never;
};

const spec: Spec<Params> = {
  arrival: {
    requires: [],
    influencedBy: [],
    fetchOptions: async () => ['asd'],
  },
  departure: {
    requires: ["date"],
    influencedBy: [],
    fetchOptions: async () => ['asd'],
  },
  date: {
    requires: ["passengers"],
    influencedBy: [],
    fetchOptions: async () => ['asd'],
  },
  passengers: {
    requires: ["date"],
    influencedBy: [],
    fetchOptions: async () => [1],
  },
};
