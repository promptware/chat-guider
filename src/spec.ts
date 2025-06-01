import type { Parameter, ParamSpec, LiteralKeys } from './types.js';

/**
 * Checks if all required dependencies for a parameter are specified
 */
export function areAllRequiredOptionsSpecified<
  A extends Record<string, Parameter<any>>,
  K extends keyof A,
  R extends (Exclude<keyof A, K>)[],
  I extends (Exclude<keyof A, K>)[]
>(
  spec: ParamSpec<A, K, R, I>,
  params: A
): boolean {
  return spec.requires.every(requiredKey => 
    params[requiredKey].state.tag === 'specified'
  );
}

/**
 * Checks if all parameters of a spec are specified
 */
export function areAllParametersSpecified<A extends Record<string, Parameter<any>>>(
  params: A
): boolean {
  return Object.values(params).every(param => 
    param.state.tag === 'specified'
  );
}

/**
 * Combines dependency values for fetching options
 * Collects required values and optional values that are specified
 */
export function combineDependencyValues<
  A extends Record<string, Parameter<any>>,
  K extends keyof A,
  R extends (Exclude<keyof A, K>)[],
  I extends (Exclude<keyof A, K>)[]
>(
  spec: ParamSpec<A, K, R, I>,
  params: A
): { [P in LiteralKeys<R>]-?: A[P] extends Parameter<infer U> ? U : never } & 
   { [P in LiteralKeys<I>]?: A[P] extends Parameter<infer U> ? U : never } {
  
  type RequiredResult = { [P in LiteralKeys<R>]-?: A[P] extends Parameter<infer U> ? U : never };
  type OptionalResult = { [P in LiteralKeys<I>]?: A[P] extends Parameter<infer U> ? U : never };
  
  const result = {} as RequiredResult & OptionalResult;

  // Collect required values
  for (const requiredKey of spec.requires) {
    const param = params[requiredKey as keyof A];
    if (param.state.tag === 'specified') {
      Object.assign(result, { [requiredKey]: param.state.value });
    }
  }

  // Collect optional values that are specified
  for (const influencedKey of spec.influencedBy) {
    const param = params[influencedKey as keyof A];
    if (param.state.tag === 'specified') {
      Object.assign(result, { [influencedKey]: param.state.value });
    }
  }

  return result;
} 