import { 
  Parameter, 
  Spec,
  makeSpec,
} from '../src/index';

import * as _ from 'lodash';

// ─── Negative Type Tests ─────────────────────────────────────

// Test 1: If a required parameter is not defined, fetchOptions should cause type error
type SimpleParams1 = {
  departure: Parameter<string>;
  // arrival is missing but required
};

const invalidSpec1: Spec<SimpleParams1> = {
  departure: makeSpec("departure", {
    description: "City of departure", 
    // @ts-expect-error - 'arrival' doesn't exist in SimpleParams1
    requires: ['arrival'],
    influencedBy: [],
    fetchOptions: async (filters: { }) => {
      return [{ value: 'test', id: 'test' }];
    },
    specify: async (value: string, options: [{ value: string; id: string; }]) => {
      return options[0];
    }
  })
};

// Test 2: If an 'influencedBy' parameter is not defined, fetchOptions should cause type error  
type SimpleParams2 = {
  departure: Parameter<string>;
  // date is missing but used in influencedBy
};

const invalidSpec2: Spec<SimpleParams2> = {
  departure: makeSpec("departure", {
    description: "City of departure",
    requires: [],
    // @ts-expect-error - 'date' doesn't exist in SimpleParams2
    influencedBy: ['date'],
    fetchOptions: async (filters: { }) => {
      return [{ value: 'test', id: 'test' }];
    },
    specify: async (value: string, options: [{ value: string; id: string; }]) => {
      return options[0];
    }
  })
};

// Test 3: Reference to non-existing parameter in 'requires' field
type SimpleParams3 = {
  departure: Parameter<string>;
  arrival: Parameter<string>;
};

const invalidSpec3: Spec<SimpleParams3> = {
  departure: makeSpec("departure", {
    description: "City of departure",
    // @ts-expect-error - 'nonexistent' is not a valid parameter
    requires: ['nonexistent'],
    influencedBy: [],
    fetchOptions: async (filters: { }) => {
      return [{ value: 'test', id: 'test' }];
    },
    specify: async (value: string, options: [{ value: string; id: string; }]) => {
      return options[0];
    }
  }),
  arrival: makeSpec("arrival", {
    description: "City of arrival",
    requires: [],
    influencedBy: [],
    fetchOptions: async () => [{ value: 'test', id: 'test' }],
    specify: async (value: string, options: [{ value: string; id: string; }]) => {
      return options[0];
    }
  })
};

// Test 4: Reference to non-existing parameter in 'influencedBy' field
type SimpleParams4 = {
  departure: Parameter<string>;
  arrival: Parameter<string>;
};

const invalidSpec4: Spec<SimpleParams4> = {
  departure: makeSpec("departure", {
    description: "City of departure", 
    requires: [],
    // @ts-expect-error - 'nonexistent' is not a valid parameter
    influencedBy: ['nonexistent'],
    fetchOptions: async (filters: { }) => {
      return [{ value: 'test', id: 'test' }];
    },
    specify: async (value: string, options: [{ value: string; id: string; }]) => {
      return options[0];
    }
  }),
  arrival: makeSpec("arrival", {
    description: "City of arrival",
    requires: [],
    influencedBy: [],
    fetchOptions: async () => [{ value: 'test', id: 'test' }],
    specify: async (value: string, options: [{ value: string; id: string; }]) => {
      return options[0];
    }
  })
};

// Test 5: Missing required parameters in fetchOptions should error
type SimpleParams5 = {
  departure: Parameter<string>;
  arrival: Parameter<string>;
};

const invalidSpec5: Spec<SimpleParams5> = {
  arrival: makeSpec("arrival", {
    description: "City of arrival",
    requires: [],
    influencedBy: [],
    // @ts-expect-error - fetchOptions missing required 'departure' parameter
    fetchOptions: async (filters: { departure: string }) => {
      return [{ value: 'test', id: 'test' }];
    },
    specify: async (value: string, options: [{ value: string; id: string; }]) => {
      return options[0];
    }
  }),
  departure: makeSpec("departure", {
    description: "City of departure",
    requires: [],
    influencedBy: [],
    fetchOptions: async () => [{ value: 'test', id: 'test' }],
    specify: async (value: string, options: [{ value: string; id: string; }]) => {
      return options[0];
    }
  })
};

// Test 6: Optional parameter is not a required parameter
type SimpleParams6 = {
  departure: Parameter<string>;
  arrival: Parameter<string>;
};

const invalidSpec6: Spec<SimpleParams6> = {
  arrival: makeSpec("arrival", {
    description: "City of arrival",
    requires: [],
    influencedBy: ['departure'],
    // @ts-expect-error - departure is optional, not required
    fetchOptions: async (filters: { departure: string }) => {
      return [{ value: 'test', id: 'test' }];
    },
    specify: async (value: string, options: [{ value: string; id: string; }]) => {
      return options[0];
    }
  }),
  departure: makeSpec("departure", {
    description: "City of departure",
    requires: [],
    influencedBy: [],
    fetchOptions: async () => [{ value: 'test', id: 'test' }],
    specify: async (value: string, options: [{ value: string; id: string; }]) => {
      return options[0];
    }
  })
};

// Test 7: Missing parameter in a spec
type SimpleParams7 = {
  departure: Parameter<string>;
  arrival: Parameter<string>;
};

// @ts-expect-error - departure is missing in the spec
const invalidSpec7: Spec<SimpleParams7> = {
  arrival: makeSpec("arrival", {
    description: "City of arrival",
    requires: [],
    influencedBy: ['departure'],
    fetchOptions: async (filters: { departure?: string }) => {
      return [{ value: 'test', id: 'test' }];
    },
    specify: async (value: string, options: [{ value: string; id: string; }]) => {
      return options[0];
    }
  }),
};

// ─── Valid Spec (Positive Test) ─────────────────────────────────────

type Params = {
  departure: Parameter<string>;
  arrival: Parameter<string>;
  date: Parameter<string>;
  passengers: Parameter<number>;
};

const entries = [
  { departure: "London", arrival: "New York", date: "2026-10-01", seats: 100 },
  { departure: "London", arrival: "New York", date: "2026-10-02", seats: 1 },
  { departure: "Berlin", arrival: "New York", date: "2026-10-03", seats: 2 },
  { departure: "Berlin", arrival: "London", date: "2026-10-04", seats: 2 },
];

// This should compile without errors - demonstrates the types work correctly
const validSpec: Spec<Params> = {
  arrival: makeSpec("arrival", {
    description: "City of arrival",
    requires: ['departure'],
    influencedBy: ['date'],
    fetchOptions: async (filters: { departure: string; date?: string }) => {
      const matches = entries.filter(entry =>
        entry.departure === filters.departure &&
        (filters.date ? entry.date === filters.date : true)
      );
      return _.uniq(matches.map(e => e.arrival)).map(value => ({ value, id: value }));
    },
    specify: async (value: string, options: [{ value: string; id: string; }]) => {
      return options[0];
    }
  }),

  departure: makeSpec("departure", {
    description: "City of departure",
    requires: [],
    influencedBy: ['arrival'],
    fetchOptions: async (filters: { arrival?: string }) => {
      const matches = entries.filter(entry =>
        (filters.arrival ? entry.arrival === filters.arrival : true)
      );
      return _.uniq(matches.map(e => e.departure)).map(value => ({ value, id: value }));
    },
    specify: async (value: string, options: [{ value: string; id: string; }]) => {
      return options[0];
    }
  }),

  date: makeSpec("date", {
    description: "Date of departure",
    requires: ['departure', 'arrival'],
    influencedBy: ['passengers'],
    fetchOptions: async (filters: {
      departure: string;
      arrival: string;
      passengers?: number;
    }) => {
      const matches = entries.filter(
        entry =>
          entry.departure === filters.departure &&
          entry.arrival === filters.arrival &&
          (filters.passengers ? entry.seats >= filters.passengers : true)
      );
      return _.uniq(matches.map(e => e.date)).map(value => ({ value, id: value }));
    },
    specify: async (value: string, options: [{ value: string; id: string; }]) => {
      return options[0];
    }
  }),

  passengers: makeSpec("passengers", {
    description: "Number of passengers",
    requires: ['departure', 'arrival', 'date'],
    influencedBy: [],
    fetchOptions: async (filters: {
      departure: string;
      arrival: string;
      date: string;
    }) => {
      const matches = entries.filter(entry =>
        entry.departure === filters.departure &&
        entry.arrival === filters.arrival &&
        entry.date === filters.date
      );
      return _.uniq(matches.map(e => e.seats)).map(value => ({
        value: value,
        id: value.toString()
      }));
    },
    specify: async (value: string, options: [{ value: number; id: string; }]) => {
      return options[0];
    }
  }),
};