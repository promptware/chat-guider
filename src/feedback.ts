export type DomainMap = Record<string, unknown>;

export type FieldFeedbackCommon<T> = {
  allowedOptions?: T[];
  feedback?: string;
  normalizedValue?: T;
};

export type FieldFeedbackRefusal =
  | {
      refusalReason: string;
    }
  | {
      // TODO: make this field required. this is a temporary hack.
      // in the future, we will have separate types for validate() response type in the public interface
      // and in the internal feedback API.
      // the public interface, that takes care of tracking required fields, will not mandate needsValidFields.
      // But we actually need them for the tool protocol, because every refusal must be accompanied by an
      // actionable reason.
      needsValidFields?: string[];
    };

export type FieldFeedbackVariants =
  | {
      valid: true;
    }
  | ({
      valid: false;
    } & FieldFeedbackRefusal);

export type FieldFeedback<T> = FieldFeedbackCommon<T> & FieldFeedbackVariants;

export type ValidationResults<D extends DomainMap> = {
  [K in Extract<keyof D, string>]: FieldFeedback<D[K]>;
};
