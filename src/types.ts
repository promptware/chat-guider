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
  D extends Record<string, SomeParameterType>,
  R extends keyof D,
  I extends keyof D
> = {
  [P in R]-?: D[P];
} & {
  [P in I]?: D[P];
};

export type ParamSpec<
  D extends Record<string, SomeParameterType>,
  K extends keyof D,
  R extends (Exclude<keyof D, K>)[],
  I extends (Exclude<keyof D, K>)[]
> = {
  requires: R;
  description: string;
  influencedBy: I;
  fetchOptions: (
    params: FetchOptionsParams<D, LiteralKeys<R>, LiteralKeys<I>>
  ) => Promise<OptionChoice<D[K]>[]>;
  specify: (
    value: string,
    options: OptionChoice<D[K]>[]
  ) => Promise<OptionChoice<D[K]>>;
};

export type ParameterValues<ParamRecord extends Record<string, Parameter<any>>> = {
  [K in keyof ParamRecord]: ParamRecord[K] extends Parameter<infer ValueType>
    ? ValueType
    : never;
};

// A helper alias for the primitive/value types a Parameter can wrap.
export type SomeParameterType = unknown;

/**
 * Wrap every property of a plain record into a Parameter<T> wrapper.
 *   { foo: string; bar: number } -> { foo: Parameter<string>; bar: Parameter<number> }
 */
export type Parameterized<R extends Record<string, SomeParameterType>> = {
  [K in keyof R]: Parameter<R[K]>;
};

/**
 * Users write `Flow<DomainParams>` where DomainParams is a plain record of values.
 * Internally we use Parameterized<DomainParams>.
 */
export type Flow<D extends Record<string, SomeParameterType>> = {
  [K in keyof D]-?: ParamSpec<
    D,
    K,
    Exclude<keyof D, K>[],
    Exclude<keyof D, K>[]
  >;
};