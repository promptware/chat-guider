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

// All good, normalized the value
export type ValidationOk<T> = { isValid: true; normalizedValue: T };
// Error with refusal reason + allowed options
export type ValidationErr<T> = { isValid: false; refusalReason: string; allowedOptions?: T[] };
// If the value was not provided, we can just show allowed options that depend on context
export type ValidationSkip<T> = { allowedOptions?: T[] };
export type ValidationResult<T> = ValidationOk<T> | ValidationErr<T> | ValidationSkip<T>;

export type FieldRule<
  D extends Domain,
  K extends keyof D,
  Requires extends Exclude<keyof D, K>[] = Exclude<keyof D, K>[],
  Influences extends Exclude<keyof D, K>[] = Exclude<keyof D, K>[],
> = {
  requires: Requires;
  influencedBy: Influences;
  description?: string;
  validate: (
    value: D[K] | undefined,
    context: Pick<D, Requires[number]> & Partial<Pick<D, Influences[number]>>,
  ) => Promise<ValidationResult<D[K]>>;
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
  function haveAllRequires<K extends keyof D>(
    rule: FieldRule<D, K>,
    provided: Partial<D>,
  ): boolean {
    return rule.requires.every(req => provided[req] !== undefined);
  }

  // Local type aliases for cleaner types
  type ValidationMap = { [P in keyof D]?: FieldFeedback<D, P> };
  type ReqKeys<K extends keyof D> = FieldRule<D, K>['requires'][number];
  type InfKeys<K extends keyof D> = FieldRule<D, K>['influencedBy'][number];
  type ContextFor<K extends keyof D> = Pick<D, ReqKeys<K>> & Partial<Pick<D, InfKeys<K>>>;

  async function validateIfReady<K extends keyof D>(
    key: K,
    rule: FieldRule<D, K>,
    normalized: Partial<D>,
    validationResults: ValidationMap,
    providedValue: D[K] | undefined,
  ): Promise<ValidationResult<D[K]>> {
    if (!haveAllRequires(rule, normalized)) {
      console.log('fixup:inactive:requires-missing', {
        field: String(key),
        requires: rule.requires,
      });
      return {} as ValidationResult<D[K]>;
    }
    // Build context using only valid influencedBy values
    const entries: [string, unknown][] = [];
    for (const req of rule.requires as (keyof D)[]) {
      const v = normalized[req];
      if (v !== undefined) entries.push([String(req), v]);
    }
    for (const inf of rule.influencedBy as (keyof D)[]) {
      const vr = validationResults[inf];
      const v = normalized[inf];
      if (v !== undefined && vr && vr.valid === true) entries.push([String(inf), v]);
    }
    const context = Object.fromEntries(entries) as unknown as ContextFor<K>;
    const resp = await rule.validate(providedValue, context);
    console.log('fixup:validate:', {
      field: String(key),
      context,
      providedValue,
      validationResult: resp,
    });
    return resp as ValidationResult<D[K]>;
  }

  async function fixup(loose: Partial<D>): Promise<FixupOutcome<D>> {
    console.log('fixup:start', loose);

    const normalized: Partial<D> = {};
    const keys = Object.keys(spec) as Extract<keyof D, string>[];

    // 2) Build per-field feedback according to requires and options
    const validationResults: ValidationMap = {};

    for (const k of keys) {
      const rule = spec[k];
      // A field is ready only if all requires are present AND previously validated as not invalid
      const requiresReady = (rule.requires as (keyof D)[]).every(dep => {
        const present = normalized[dep] !== undefined;
        const depVr = validationResults[dep];
        const isValid = depVr && depVr.valid === true;
        return present && isValid;
      });

      if (!requiresReady) {
        const missing: string[] = [];
        for (const dep of rule.requires as (keyof D)[]) {
          const depKey = String(dep);
          const present = normalized[dep] !== undefined;
          const depVr = validationResults[dep];
          const invalid = depVr && depVr.valid === false;
          if (!present || invalid) missing.push(depKey);
        }
        const msg = `requires a valid ${missing.join(', ')} first`;
        console.log('fixup:skip (missing requirements)', { field: k, missing });
        (validationResults as ValidationMap)[k as keyof D] = {
          valid: false,
          refusalReason: msg,
        } as FieldFeedback<D, any>;
        continue;
      }

      const resp = await validateIfReady(
        k as keyof D,
        rule as FieldRule<D, keyof D>,
        normalized,
        validationResults,
        loose[k as keyof D] as D[keyof D] | undefined,
      );
      const allowed = ('allowedOptions' in resp ? resp.allowedOptions : undefined) as
        | D[keyof D][]
        | undefined;
      if ('isValid' in resp && resp.isValid === true) {
        const norm = resp.normalizedValue as D[typeof k];
        normalized[k as keyof D] = norm;
        (validationResults as ValidationMap)[k as keyof D] = {
          valid: true,
          allowedOptions: allowed,
        } as FieldFeedback<D, any>;
      } else if ('isValid' in resp && resp.isValid === false) {
        (validationResults as ValidationMap)[k as keyof D] = {
          valid: false,
          refusalReason: resp.refusalReason,
          allowedOptions: allowed,
        } as FieldFeedback<D, any>;
      } else {
        // ValidationSkip: just allowedOptions for context without refusalReason
        (validationResults as ValidationMap)[k as keyof D] = {
          valid: false,
          allowedOptions: allowed,
        } as FieldFeedback<D, any>;
      }
    }

    // 4) Decide outcome
    const allValid = keys.every(
      k => (validationResults as ValidationMap)[k as keyof D]?.valid === true,
    );
    const allPresent = keys.every(k => normalized[k as keyof D] !== undefined);
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
