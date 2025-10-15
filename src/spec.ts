import type {
  Parameter,
  ParamSpec,
  LiteralKeys,
  Parameterized,
  SomeParameterType,
} from './types.js';

/**
 * Checks if all required dependencies for a parameter are specified
 */
export function areAllRequiredOptionsSpecified<
  D extends Record<string, SomeParameterType>,
  K extends keyof D,
  R extends Exclude<keyof D, K>[],
  I extends Exclude<keyof D, K>[],
>(spec: ParamSpec<D, K, R, I>, params: Parameterized<D>): boolean {
  return spec.requires.every(requiredKey => params[requiredKey].state.tag === 'specified');
}

/**
 * Checks if all parameters of a spec are specified
 */
export function areAllParametersSpecified<D extends Record<string, SomeParameterType>>(
  params: Parameterized<D>,
): boolean {
  return Object.values(params).every(param => param.state.tag === 'specified');
}

/**
 * Combines dependency values for fetching options
 * Collects required values and optional values that are specified
 */
export function combineDependencyValues<
  D extends Record<string, SomeParameterType>,
  K extends keyof D,
  R extends Exclude<keyof D, K>[],
  I extends Exclude<keyof D, K>[],
>(
  spec: ParamSpec<D, K, R, I>,
  params: Parameterized<D>,
): { [P in LiteralKeys<R>]-?: D[P] } & { [P in LiteralKeys<I>]?: D[P] } {
  type RequiredResult = { [P in LiteralKeys<R>]-?: D[P] };
  type OptionalResult = { [P in LiteralKeys<I>]?: D[P] };

  const result = {} as RequiredResult & OptionalResult;

  // Collect required values
  for (const requiredKey of spec.requires) {
    const param = params[requiredKey as keyof D];
    if (param.state.tag === 'specified') {
      Object.assign(result, { [requiredKey]: param.state.value });
    }
  }

  // Collect optional values that are specified
  for (const influencedKey of spec.influencedBy) {
    const param = params[influencedKey as keyof D];
    if (param.state.tag === 'specified') {
      Object.assign(result, { [influencedKey]: param.state.value });
    }
  }

  return result;
}
