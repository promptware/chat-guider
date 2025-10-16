import { AtLeastOne, NonEmptyArray } from './types';

export type T2TFieldFeedbackCommon<T> = {
  allowedValues?: T[];
  feedback?: string;
  normalizedValue?: T;
  suggestedValues?: T[];
};

export type T2TFieldFeedbackRefusal = AtLeastOne<
  {
    refusalReason?: string;
    needsValidFields?: NonEmptyArray<string>;
  },
  'refusalReason' | 'needsValidFields'
>;

export type T2TFieldFeedbackVariants =
  | {
      valid: true;
    }
  | ({
      valid: false;
    } & T2TFieldFeedbackRefusal);

export type T2TFieldFeedback<T> = T2TFieldFeedbackCommon<T> & T2TFieldFeedbackVariants;
