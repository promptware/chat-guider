import { detectRequiresCycles } from './graph.js';

export type FieldFeedback<D extends Domain, K extends keyof D> = {
  valid: boolean;
  allowedOptions?: D[K][];
  refusalReason?: string; // e.g., 'no matching options' | `requires a valid <deps> first`
};

export type FixupAccepted<D extends Domain> = {
  tag: 'accepted';
  value: D;
};

export type FixupRejected<D extends Domain> = {
  tag: 'rejected';
  validationResults: { [K in keyof D]: FieldFeedback<D, K> };
};

export type FixupOutcome<D extends Domain> = FixupAccepted<D> | FixupRejected<D>;

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
  ) => Promise<D[K][]> | D[K][];
  normalize?: (raw: unknown) => D[K] | undefined;
  validate?: (
    value: D[K],
    context: {
      optionsForField: D[K][];
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

export function compileFixup<D extends Domain>(spec: ValidationSpec<D>) {
  function haveAllRequires<K extends keyof D>(rule: FieldRule<D, K>, provided: Partial<D>): boolean {
    return rule.requires.every((req) => provided[req] !== undefined);
  }

  function makeFilters<K extends keyof D>(
    rule: FieldRule<D, K>,
    provided: Partial<D>,
    validationResults?: { [K in keyof D]?: FieldFeedback<D, K> }
  ): Partial<D> {
    const filters: Partial<D> = {};
    // requires are guaranteed valid by the caller if requiresReady
    for (const req of rule.requires) {
      if (provided[req] !== undefined) (filters as any)[req] = provided[req];
    }
    // include only influencedBy that are present and validated as valid
    for (const inf of rule.influencedBy) {
      const vr = validationResults ? (validationResults as any)[inf] : undefined;
      if (provided[inf] !== undefined && vr && vr.valid === true) (filters as any)[inf] = provided[inf];
    }
    return filters;
  }

  async function fetchOptionsIfReady<K extends keyof D>(
    key: K,
    rule: FieldRule<D, K>,
    provided: Partial<D>,
    validationResults?: { [K in keyof D]?: FieldFeedback<D, K> }
  ): Promise<D[K][]> {
    if (!haveAllRequires(rule, provided)) {
      console.log('fixup:no-options:requires-missing', { field: String(key), requires: rule.requires });
      return [];
    }
    const filters = makeFilters(rule, provided, validationResults) as any;
    console.log('fixup:fetchOptions', { field: String(key), filters });
    return await rule.fetchOptions(filters);
  }

  async function fixup(loose: Partial<D>): Promise<FixupOutcome<D>> {
    console.log('fixup:start', loose);

    // 1) Normalize provided values only
    const normalized: Partial<D> = {};
    const keys = Object.keys(spec) as Extract<keyof D, string>[];
    for (const k of keys) {
      const rule = spec[k];
      const raw = loose[k];
      if (raw === undefined) continue;
      const norm = rule.normalize ? rule.normalize(raw) : (raw as D[typeof k]);
      if (norm === undefined) {
        console.log('fixup:normalize-failed', { field: k, raw });
        // keep absent; reason will be recorded below
      } else {
        normalized[k] = norm;
      }
    }

    // 2) Build per-field feedback according to requires and options
    const validationResults = {} as { [K in keyof D]: FieldFeedback<D, K> };

    for (const k of keys) {
      const rule = spec[k];
      const value = normalized[k];
      // A field is ready only if all requires are present AND previously validated as not invalid
      const requiresReady = (rule.requires as (keyof D)[]).every((dep) => {
        const present = normalized[dep] !== undefined;
        const depVr = (validationResults as any)[dep];
        const isValid = depVr && depVr.valid === true;
        return present && isValid;
      });

      if (!requiresReady) {
        const missing: string[] = [];
        for (const dep of rule.requires) {
          const depKey = dep as unknown as string;
          const present = normalized[dep] !== undefined;
          const depVr = (validationResults as any)[dep];
          const invalid = depVr && depVr.valid === false;
          if (!present || invalid) missing.push(depKey);
        }
        const msg = `requires a valid ${missing.join(', ')} first`;
        console.log('fixup:inactive-field', { field: k, missing });
        (validationResults as any)[k] = { valid: false, refusalReason: msg };
        continue;
      }

      const opts = await fetchOptionsIfReady(k as any, rule as any, normalized, validationResults as any);
      if (opts.length === 0) {
        console.log('fixup:no-matching-options', { field: k });
        (validationResults as any)[k] = { valid: false, refusalReason: 'no matching options' };
        continue;
      }

      if (value === undefined) {
        console.log('fixup:missing-with-allowed', { field: k, allowedOptions: opts });
        (validationResults as any)[k] = { valid: false, allowedOptions: opts as any };
        continue;
      }

      const inOptions = opts.some(v => Object.is(v, value));
      if (!inOptions) {
        console.log('fixup:provided-not-in-options', { field: k, value, allowedOptions: opts });
        (validationResults as any)[k] = { valid: false, refusalReason: 'no matching options', allowedOptions: opts as any };
        continue;
      }

      const refusal = rule.validate?.(value as D[typeof k], { optionsForField: opts as any, wholeInput: normalized });
      if (refusal) {
        console.log('fixup:validate-refusal', { field: k, refusal });
        (validationResults as any)[k] = { valid: false, refusalReason: 'no matching options', allowedOptions: opts as any };
        continue;
      }

      (validationResults as any)[k] = { valid: true, allowedOptions: opts as any };
    }

    // 4) Decide outcome
    const allValid = keys.every(k => (validationResults as any)[k].valid === true);
    const allPresent = keys.every(k => normalized[k] !== undefined);
    if (!allValid || !allPresent) {
      const res = { tag: 'rejected', validationResults } as FixupRejected<D>;
      console.log('fixup:rejected', JSON.stringify(res, null, 2));
      return res;
    }

    const res = { tag: 'accepted', value: normalized as D } as FixupAccepted<D>;
    console.log('fixup:accepted', JSON.stringify(res, null, 2));
    return res;
  }

  return fixup;
}


