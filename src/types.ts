export type ParameterState<A> =
  | { tag: 'empty' }
  | { tag: 'provided'; value: string }
  | { tag: 'specified'; value: A };

export interface OptionChoice<T> {
  id: string;
  value: T;
}

export type ParameterOptions<A> =
  | { tag: 'unknown' }
  | { tag: 'available'; variants: OptionChoice<A>[] };

export type Parameter<A> = {
  state: ParameterState<A>;
  options: ParameterOptions<A>;
};

export type LiteralKeys<T extends (string | number | symbol)[]> = T[number];

export type FetchOptionsParams<
  A,
  R extends keyof A,
  I extends keyof A
> = {
  [P in R]-?: A[P] extends Parameter<infer U> ? U : never;
} & {
  [P in I]?: A[P] extends Parameter<infer U> ? U : never;
};

export type ParamSpec<
  A,
  K extends keyof A,
  R extends (Exclude<keyof A, K>)[],
  I extends (Exclude<keyof A, K>)[],
  T = A[K] extends Parameter<infer U> ? U : never
> = {
  requires: R;
  description: string;
  influencedBy: I;
  fetchOptions: (
    params: FetchOptionsParams<A, LiteralKeys<R>, LiteralKeys<I>>
  ) => Promise<OptionChoice<T>[]>;
  specify: (
    value: string,
    options: OptionChoice<T>[]
  ) => Promise<OptionChoice<T>>;
};

export type Flow<A extends Record<string, Parameter<any>>> = {
  [K in keyof A]-?: ParamSpec<A, K, Exclude<keyof A, K>[], Exclude<keyof A, K>[]>
} 