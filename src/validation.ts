import type { OptionChoice } from './types.js';
import { detectRequiresCycles } from './graph.js';

export type FeedbackReason<K extends string = string> = {
  field: K;
  allowedOptions?: string[];
  refusalReason?: string;
};

export type FixupAccepted<D> = {
  tag: 'accepted';
  value: D;
  options: { [K in keyof D]: OptionChoice<D[K]>[] };
};

export type FixupRejected<D> = {
  tag: 'rejected';
  reasons: FeedbackReason<Extract<keyof D, string>>[];
  options: { [K in keyof D]: OptionChoice<D[K]>[] };
};

export type FixupOutcome<D> = FixupAccepted<D> | FixupRejected<D>;

export type Domain = Record<string, unknown>;

export type FieldRule<
  D extends Domain,
  K extends keyof D,
  Requires extends Exclude<keyof D, K>[] = Exclude<keyof D, K>[],
  Influences extends Exclude<keyof D, K>[] = Exclude<keyof D, K>[]
> = {
  requires: Requires;
  influencedBy: Influences;
  description?: string;
  fetchOptions: (
    filters: Pick<D, Requires[number]> & Partial<Pick<D, Influences[number]>>
  ) => Promise<OptionChoice<D[K]>[]> | OptionChoice<D[K]>[];
  normalize?: (raw: unknown) => D[K] | undefined;
  validate?: (
    value: D[K],
    context: {
      optionsForField: OptionChoice<D[K]>[];
      wholeInput: Partial<D>;
    }
  ) => string | undefined;
};

export type ValidationSpec<D extends Domain> = {
  [K in keyof D]: FieldRule<D, K>;
};

export function defineValidationSpec<D extends Domain>() {
  return <S extends ValidationSpec<D>>(spec: S) => {
    // Cycle detection on requires graph
    const flowLike: any = {};
    for (const key of Object.keys(spec)) {
      flowLike[key] = {
        requires: spec[key as keyof S].requires as string[],
        influencedBy: spec[key as keyof S].influencedBy as string[],
        description: spec[key as keyof S].description ?? '',
        // placeholders for compatibility; not used by cycle detection
        fetchOptions: () => [],
      };
    }
    const cycles = detectRequiresCycles(flowLike);
    if (cycles.length > 0) {
      const msg = cycles.map(c => c.join(' -> ')).join('; ');
      throw new Error(`Cycle detected in requires graph: ${msg}`);
    }
    return spec;
  };
}

export async function compileFixup<D extends Domain>(spec: ValidationSpec<D>) {
  async function computeOptions(loose: Partial<D>): Promise<{ [K in keyof D]: OptionChoice<D[K]>[] }> {
    const entries = Object.entries(spec) as [keyof D, FieldRule<D, keyof D>][];
    const results = await Promise.all(entries.map(async ([key, rule]) => {
      const filters: Partial<D> = {};
      for (const req of rule.requires) {
        if (loose[req] !== undefined) (filters as any)[req] = loose[req];
      }
      for (const inf of rule.influencedBy) {
        if (loose[inf] !== undefined) (filters as any)[inf] = loose[inf];
      }
      const options = await rule.fetchOptions(filters as any);
      return [key, options] as const;
    }));
    return Object.fromEntries(results) as any;
  }

  async function fixup(loose: Partial<D>): Promise<FixupOutcome<D>> {
    const options = await computeOptions(loose);
    const normalized: Partial<D> = {};
    const reasons: FeedbackReason<Extract<keyof D, string>>[] = [];

    for (const k of Object.keys(spec) as (keyof D)[]) {
      const rule = spec[k];
      const raw = loose[k];

      if (raw === undefined) {
        reasons.push({ field: k as Extract<keyof D, string>, allowedOptions: options[k].map(o => String(o.value)) });
        continue;
      }

      const norm = rule.normalize ? rule.normalize(raw) : (raw as D[typeof k]);
      if (norm === undefined) {
        reasons.push({ field: k as Extract<keyof D, string>, refusalReason: 'failed to normalize input', allowedOptions: options[k].map(o => String(o.value)) });
        continue;
      }

      const hasOptions = options[k].length > 0;
      const isAllowed = hasOptions ? options[k].some(o => Object.is(o.value, norm)) : true;
      if (!isAllowed) {
        reasons.push({ field: k as Extract<keyof D, string>, allowedOptions: options[k].map(o => String(o.value)) });
        continue;
      }

      const refusal = rule.validate?.(norm, { optionsForField: options[k], wholeInput: loose });
      if (refusal) {
        reasons.push({ field: k as Extract<keyof D, string>, refusalReason: refusal, allowedOptions: options[k].map(o => String(o.value)) });
        continue;
      }

      normalized[k] = norm;
    }

    if (reasons.length > 0) {
      return { tag: 'rejected', reasons, options } as FixupRejected<D>;
    }
    return { tag: 'accepted', value: normalized as D, options } as FixupAccepted<D>;
  }

  return { fixup };
}


