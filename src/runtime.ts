import * as util from "util";
import { match, P } from 'ts-pattern';
import type { Parameter, ParamSpec, Spec, OptionChoice } from './types.js';
import { detectRequiresCycles } from './graph.js';
import { specifyUsingOpenRouter } from './specify-param.js';
import { askUserForValue } from './ask.js';
import { areAllRequiredOptionsSpecified, areAllParametersSpecified, combineDependencyValues } from './spec.js';

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
  >(
    _key: K,
    // Make specify optional, because we want the user to be able to omit it
    entry: Omit<ParamSpec<A, K, R, I>, 'specify'> & {
      specify?: ParamSpec<A, K, R, I>['specify']
    }
  ): ParamSpec<A, K, R, I> {
    return {
      ...entry,
      specify: entry.specify ?? specifyUsingOpenRouter
    } as ParamSpec<A, K, R, I>;
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

type FlowStep<A> = {
  type: 'ask',
  key: keyof A,
  options: OptionChoice<any>[]
} | {
  type: 'done',
  params: A,
} | {
  type: 'refuse-empty-options',
  key: keyof A,
}

export async function flowIteration<A extends Record<string, Parameter<any>>>(spec: Spec<A>, params: A): Promise<FlowStep<A> | null> {
  console.log('flowIteration', params);
  if (areAllParametersSpecified(params)) {
    return { type: 'done', params };
  }
  
  // find parameters to work with
  for (const key of Object.keys(spec) as Array<keyof A>) {
    const param = params[key];
    const step: FlowStep<A> | null = await match([param.state, param.options] as const)
      .with([{ tag: "provided" }, { tag: "available", variants: [] }], () => {
        // TODO: consider moving this check close to options fetching logic
        return { type: 'refuse-empty-options' as const, key };
      })
      .with([{ tag: "provided" }, { tag: "available" }], async ([state, options]) => {
        param.state = {
          tag: 'specified',
          value: await spec[key].specify(state.value, options.variants)
        };
        return null;
      })
      .with([{ tag: "provided" }, { tag: "unknown" }], async () => {
        // Check if all required options are specified
        if (areAllRequiredOptionsSpecified(spec[key], params)) {
          // Collect the values of all required options
          const allValues = combineDependencyValues(spec[key], params);
          
          const options = await spec[key].fetchOptions(allValues);
          param.options = {
            tag: 'available',
            variants: options
          }
          return null;
        } else {
          // skip. we'll try again later.
          return null;
        }
      })
      .with([{ tag: "specified" }, P._], () => {
        // Already specified, nothing to do
        return null;
      })
      .with([{ tag: "empty" }, P._], async () => {
        const areSpecified = areAllRequiredOptionsSpecified(spec[key], params);
        console.log('areSpecified', key, areSpecified, spec[key].requires);
        // Try to fetch options if all required dependencies are specified
        let options: OptionChoice<any>[] = [];
        if (areSpecified) {
          const allValues = combineDependencyValues(spec[key], params);
          console.log('allValues', allValues);
          options = await spec[key].fetchOptions(allValues);
          return {
            type: 'ask' as const,
            key,
            options
          };
        } else {
          return null;
        }
      })
      .exhaustive();
    if (step !== null) {
      return step;
    }
  }

  return null;
}

export async function runFlow<T extends Record<string, Parameter<any>>>(
  spec: Spec<T>,
  askUser: (question: string) => Promise<string>
): Promise<T> {
  const cycles = detectRequiresCycles(spec);
  if (cycles.length) {
    throw new Error(`Your spec contains a cycle: ${cycles[0].join(' -> ')}`);
  }

  let params: T = await initParams(spec);
  log('initialParams', params);

  while (true) {
    const step = await flowIteration(spec, params);
    if (step === null) {
      break;
    }

    if (step.type === 'ask') {
      const botQuestion = await askUserForValue(String(step.key), spec[step.key].description, step.options);
      const userAnswer = await askUser(botQuestion);
      // TODO: handle specifier errors
      const value = await spec[step.key].specify(userAnswer, step.options);
      params[step.key].state = {
        tag: 'specified',
        value
      };
    } else if (step.type === 'done') {
      return step.params;
    } else if (step.type === 'refuse-empty-options') {
      // TODO: recursively clear specified values until we find a parameter that has available options
      // TODO: if we can't find such a parameter, throw an error
      throw new Error(`Parameter '${String(step.key)}' has no available options when trying to specify`);
    }
  }
  return params;
}