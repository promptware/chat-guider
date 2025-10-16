import { NonEmptyArray } from './types';

export type FieldFeedbackCommon<T> = {
  allowedOptions?: T[];
  feedback?: string;
  normalizedValue?: T;
  suggestedValues?: T[];
};

export type FieldFeedbackRefusal = {
  refusalReason?: string;
  needsValidFields?: NonEmptyArray<string>;
};

export type FieldFeedbackVariants =
  | {
      valid: true;
    }
  | ({
      valid: false;
    } & FieldFeedbackRefusal);

export type FieldFeedback<T> = FieldFeedbackCommon<T> & FieldFeedbackVariants;
