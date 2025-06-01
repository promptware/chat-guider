import * as util from "util";
import type { Parameter, ParamSpec, Spec } from './types.js';
import { detectRequiresCycles } from './graph.js';

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

export function makeSpec<
  A extends Record<K, Parameter<any>>,
  K extends keyof A,
  R extends (Exclude<keyof A, K>)[],
  I extends (Exclude<keyof A, K>)[],
  >(_key: K, entry: ParamSpec<A, K, R, I>): ParamSpec<A, K, R, I> {
    return entry;
}

function makeParameter<
  A extends Record<K, Parameter<A[K]>>,
  K extends keyof A,
  >(_key: K): Parameter<A[K]> {
    const ak: Parameter<A[K]> = {
      state: { tag: 'empty' },
      options: { tag: 'unknown' }
    };
    return ak;
}

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

export async function specifyParameter(value: string): Promise<any> {
  // TODO: Implement parameter specification logic
  return value;
}

export async function flowLoop<A extends Record<string, Parameter<any>>>(spec: Spec<A>, params: A): Promise<null | A> {
  // if every parameter is specified,
  // dispatch
  let allSpecified = true;
  for (const key of Object.keys(spec) as Array<keyof A>) {
    if (params[key].state.tag != "specified") {
      allSpecified = false;
      break;
    }
  }

  if (allSpecified) {
    return params;
  }

  // otherwise, find parameters to specify
  // if some, specify and repeat
  for (const key of Object.keys(spec) as Array<keyof A>) {
    if (params[key].state.tag == "provided") {
      params[key].state = {
        tag: 'specified',
        value: await specifyParameter(params[key].state.value)
      };
    }
  }

  if (allSpecified) {
    return params;
  }

  // if none, find parameters to ask about

  // if there are none, dead end
  // (must be unreachable)
  return null
}

export async function runFlow<T extends Record<string, Parameter<any>>>(spec: Spec<T>): Promise<void> {
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