export type ParameterState<A> =
  | { tag: 'empty' }
  | { tag: 'provided'; value: string }
  | { tag: 'specified'; value: A };

export type ParameterOptions<A> =
  | { tag: 'unknown' }
  | { tag: 'available'; variants: { id: string; value: A; }[] };

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
  specify: (
    value: string,
    options: A[K] extends Parameter<infer T>
      ? [{ value: T; id: string; }]
      : never
  ) => Promise<
    A[K] extends Parameter<infer T>
    ? { value: T; id: string; }
    : never
    >;
}

export type Spec<A extends Record<string, Parameter<any>>> = {
  [K in keyof A]: A[K] extends Parameter<infer _>
    ? ParamSpec<A, K, Exclude<keyof A, K>[], Exclude<keyof A, K>[]>
    : never;
}; 