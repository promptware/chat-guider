import * as util from "util";
import { match, P } from 'ts-pattern';
import type { Parameter, ParamSpec, Flow, OptionChoice, Parameterized, SomeParameterType } from './types.js';
import { detectRequiresCycles } from './graph.js';
import { specifyUsingOpenRouter } from './specify-param.js';
import { askUserForValue } from './ask.js';
import { areAllRequiredOptionsSpecified, areAllParametersSpecified, combineDependencyValues } from './spec.js';
import _ from 'lodash';

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

export function parameter<
  D extends Record<string, SomeParameterType>,
  K extends keyof D,
  R extends (Exclude<keyof D, K>)[],
  I extends (Exclude<keyof D, K>)[],
>(
  _key: K,
  entry: Omit<ParamSpec<D, K, R, I>, 'specify'> & {
    specify?: ParamSpec<D, K, R, I>['specify'];
  }
): ParamSpec<D, K, R, I> {
  return {
    ...entry,
    specify: entry.specify ?? specifyUsingOpenRouter,
  } as ParamSpec<D, K, R, I>;
}

function initParam<
  D extends Record<string, SomeParameterType>,
  K extends keyof D,
  >(_key: K): Parameter<D[K]> {
    return {
      state: { tag: 'empty' },
      options: { tag: 'unknown' }
    };
}

export async function initParams<D extends Record<string, SomeParameterType>>(
  spec: Flow<D>
): Promise<Parameterized<D>> {
  // Synchronously initialize all params using lodash
  let params = _.mapValues(spec, (_specEntry, keyString) => {
    const key = keyString as keyof D;
    return initParam<D, typeof key>(key);
  }) as Parameterized<D>;

  for (const key of Object.keys(spec) as Array<keyof D>) {
    if (spec[key].requires.length === 0) {
      const variants = await spec[key].fetchOptions({} as any);
      params = {
        ...params,
        [key]: {
          ...params[key],
          options: {
            tag: 'available',
            variants,
          },
        },
      };
    }
  }
  return params;
}

type FlowStep<D extends Record<string, SomeParameterType>> = {
  type: 'done',
  params: Parameterized<D>,
} | {
  type: 'refuse-empty-options',
  key: keyof D,
} | {
  type: 'need-specify',
  key: keyof D,
  userValue: string,
  options: OptionChoice<unknown>[]
} | {
  type: 'need-fetch-for-update',
  key: keyof D,
  filters: Record<string, unknown>
} | {
  type: 'need-fetch-for-ask',
  key: keyof D,
  filters: Record<string, unknown>
}

export function nextFlowStep<D extends Record<string, SomeParameterType>>(spec: Flow<D>, params: Parameterized<D>): FlowStep<D> | null {
  console.log('nextFlowStep', params);
  if (areAllParametersSpecified(params)) {
    return { type: 'done', params };
  }
  
  // find parameters to work with
  // TODO: add priorities
  for (const key of Object.keys(spec) as Array<keyof D>) {
    const param = params[key];
    const step: FlowStep<D> | null = match([param.state, param.options] as const)
      .with([{ tag: "provided" }, { tag: "available", variants: [] }], () => {
        // TODO: consider moving this check close to options fetching logic
        return { type: 'refuse-empty-options' as const, key };
      })
      .with([{ tag: "provided" }, { tag: "available" }], ([state, options]) => {
        return { type: 'need-specify' as const, key, userValue: state.value, options: options.variants };
      })
      .with([{ tag: "provided" }, { tag: "unknown" }], () => {
        // Check if all required options are specified
        if (areAllRequiredOptionsSpecified(spec[key], params)) {
          // Collect the values of all required options
          const allValues = combineDependencyValues(spec[key], params);
          return { type: 'need-fetch-for-update' as const, key, filters: allValues };
        } else {
          // skip. we'll try again later.
          return null;
        }
      })
      .with([{ tag: "specified" }, P._], () => {
        // Already specified, nothing to do
        return null;
      })
      .with([{ tag: "empty" }, P._], () => {
        const areSpecified = areAllRequiredOptionsSpecified(spec[key], params);
        console.log('areSpecified', key, areSpecified, spec[key].requires);
        // Try to fetch options if all required dependencies are specified
        if (areSpecified) {
          const allValues = combineDependencyValues(spec[key], params);
          console.log('allValues', allValues);
          return {
            type: 'need-fetch-for-ask' as const,
            key,
            filters: allValues
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

  throw new Error('Exhausted all parameters, but haven\'t reached done state');
}

async function advanceFlow<D extends Record<string, SomeParameterType>>(
  spec: Flow<D>,
  params: Parameterized<D>,
  step: Exclude<FlowStep<D>, { type: 'done' }>,
  askUser: (question: string) => Promise<string>
): Promise<Parameterized<D>> {
  const key = step.key;
  const param = { ...params[key] };

  if (step.type === 'need-specify') {
    const paramSpec = spec[key];
    const optionChoice = await paramSpec.specify(step.userValue, step.options as any);
    param.state = {
      tag: 'specified',
      value: optionChoice.value as D[typeof key]
    };
  } else if (step.type === 'need-fetch-for-update') {
    const paramSpec = spec[key];
    const options = await paramSpec.fetchOptions(step.filters as any);
    param.options = {
      tag: 'available',
      variants: options as OptionChoice<D[typeof key]>[]
    };
  } else if (step.type === 'need-fetch-for-ask') {
    const paramSpec = spec[key];
    const options = await paramSpec.fetchOptions(step.filters as any);
    const botQuestion = await askUserForValue(String(key), paramSpec.description, options);
    const userAnswer = await askUser(botQuestion);
    // TODO: handle specifier errors
    const optionChoice = await paramSpec.specify(userAnswer, options);
    param.state = {
      tag: 'specified',
      value: optionChoice.value as D[typeof key]
    };
  } else if (step.type === 'refuse-empty-options') {
    // TODO: recursively clear specified values until we find a parameter that has available options
    // TODO: if we can't find such a parameter, throw an error
    throw new Error(`Parameter '${String(step.key)}' has no available options when trying to specify`);
  }

  return { ...params, [key]: param };
}

export async function runFlow<D extends Record<string, SomeParameterType>>(
  spec: Flow<D>,
  askUser: (question: string) => Promise<string>
): Promise<Parameterized<D>> {
  const cycles = detectRequiresCycles(spec);
  if (cycles.length) {
    throw new Error(`Your spec contains a cycle: ${cycles[0].join(' -> ')}`);
  }

  let params: Parameterized<D> = await initParams(spec);
  log('initialParams', params);

  while (true) {
    const step = nextFlowStep(spec, params);
    if (step === null) {
      break;
    }

    if (step.type === 'done') {
      return step.params;
    }

    params = await advanceFlow(spec, params, step, askUser);
  }
  return params;
}