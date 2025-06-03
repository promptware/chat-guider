import type { 
  Flow,
  OptionChoice,
} from '../src/index.js';
import { parameter } from '../src/index.js';

import * as _ from 'lodash';

// ─── Negative Type Tests ─────────────────────────────────────

// Test 1: If a required parameter is not defined, fetchOptions should cause type error
type SimpleParams1 = {
  departure: string;
  // arrival is missing but required
};

const invalidSpec1: Flow<SimpleParams1> = {
  departure: parameter("departure", {
    description: "City of departure", 
    // @ts-expect-error - 'arrival' doesn't exist in SimpleParams1
    requires: ['arrival'],
    influencedBy: [],
    fetchOptions: async (filters: { }) => {
      return [{ value: 'test', id: 'test' }];
    },
    specify: async (value: string, options: OptionChoice<string>[]) => {
      return options[0];
    }
  })
};

// Test 2: If an 'influencedBy' parameter is not defined, fetchOptions should cause type error  
type SimpleParams2 = {
  departure: string;
  // date is missing but used in influencedBy
};

const invalidSpec2: Flow<SimpleParams2> = {
  departure: parameter("departure", {
    description: "City of departure",
    requires: [],
    // @ts-expect-error - 'date' doesn't exist in SimpleParams2
    influencedBy: ['date'],
    fetchOptions: async (filters: { }) => {
      return [{ value: 'test', id: 'test' }];
    },
    specify: async (value: string, options: OptionChoice<string>[]) => {
      return options[0];
    }
  })
};

// Test 3: Reference to non-existing parameter in 'requires' field
type SimpleParams3 = {
  departure: string;
  arrival: string;
};

const invalidSpec3: Flow<SimpleParams3> = {
  departure: parameter("departure", {
    description: "City of departure",
    // @ts-expect-error - 'nonexistent' is not a valid parameter
    requires: ['nonexistent'],
    influencedBy: [],
    fetchOptions: async (filters: { }) => {
      return [{ value: 'test', id: 'test' }];
    },
    specify: async (value: string, options: OptionChoice<string>[]) => {
      return options[0];
    }
  }),
  arrival: parameter("arrival", {
    description: "City of arrival",
    requires: [],
    influencedBy: [],
    fetchOptions: async () => [{ value: 'test', id: 'test' }],
    specify: async (value: string, options: OptionChoice<string>[]) => {
      return options[0];
    }
  })
};

// Test 4: Reference to non-existing parameter in 'influencedBy' field
type SimpleParams4 = {
  departure: string;
  arrival: string;
};

const invalidSpec4: Flow<SimpleParams4> = {
  departure: parameter("departure", {
    description: "City of departure", 
    requires: [],
    // @ts-expect-error - 'nonexistent' is not a valid parameter
    influencedBy: ['nonexistent'],
    fetchOptions: async (filters: { }) => {
      return [{ value: 'test', id: 'test' }];
    },
    specify: async (value: string, options: OptionChoice<string>[]) => {
      return options[0];
    }
  }),
  arrival: parameter("arrival", {
    description: "City of arrival",
    requires: [],
    influencedBy: [],
    fetchOptions: async () => [{ value: 'test', id: 'test' }],
    specify: async (value: string, options: OptionChoice<string>[]) => {
      return options[0];
    }
  })
};

// Test 5: Missing required parameters in fetchOptions should error
type SimpleParams5 = {
  departure: string;
  arrival: string;
};

const invalidSpec5: Flow<SimpleParams5> = {
  arrival: parameter("arrival", {
    description: "City of arrival",
    requires: [],
    influencedBy: [],
    // @ts-expect-error - fetchOptions missing required 'departure' parameter
    fetchOptions: async (filters: { departure: string }) => {
      return [{ value: 'test', id: 'test' }];
    },
    specify: async (value: string, options: OptionChoice<string>[]) => {
      return options[0];
    }
  }),
  departure: parameter("departure", {
    description: "City of departure",
    requires: [],
    influencedBy: [],
    fetchOptions: async () => [{ value: 'test', id: 'test' }],
    specify: async (value: string, options: OptionChoice<string>[]) => {
      return options[0];
    }
  })
};

// Test 6: Optional parameter is not a required parameter
type SimpleParams6 = {
  departure: string;
  arrival: string;
};

const invalidSpec6: Flow<SimpleParams6> = {
  arrival: parameter("arrival", {
    description: "City of arrival",
    requires: [],
    influencedBy: ['departure'],
    // @ts-expect-error - departure is optional, not required
    fetchOptions: async (filters: { departure: string }) => {
      return [{ value: 'test', id: 'test' }];
    },
    specify: async (value: string, options: OptionChoice<string>[]) => {
      return options[0];
    }
  }),
  departure: parameter("departure", {
    description: "City of departure",
    requires: [],
    influencedBy: [],
    fetchOptions: async () => [{ value: 'test', id: 'test' }],
    specify: async (value: string, options: OptionChoice<string>[]) => {
      return options[0];
    }
  })
};

// Test 7: Missing parameter in a spec
type SimpleParams7 = {
  departure: string;
  arrival: string;
};

// @ts-expect-error - departure is missing in the spec
const invalidSpec7: Flow<SimpleParams7> = {
  arrival: parameter("arrival", {
    description: "City of arrival",
    requires: [],
    influencedBy: ['departure'],
    fetchOptions: async (filters: { departure?: string }) => {
      return [{ value: 'test', id: 'test' }];
    },
    specify: async (value: string, options: OptionChoice<string>[]) => {
      return options[0];
    }
  }),
};

// ─── Valid Spec (Positive Test) ─────────────────────────────────────

type Params = {
  departure: string;
  arrival: string;
  date: string;
  passengers: number;
};

const entries = [
  { departure: "London", arrival: "New York", date: "2026-10-01", seats: 100 },
  { departure: "London", arrival: "New York", date: "2026-10-02", seats: 1 },
  { departure: "Berlin", arrival: "New York", date: "2026-10-03", seats: 2 },
  { departure: "Berlin", arrival: "London", date: "2026-10-04", seats: 2 },
];

const arrival = parameter<Params, "arrival", ["departure"], ["date"]>("arrival", {
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
  specify: async (value: string, options: OptionChoice<string>[]) => {
    return options[0];
  }
})

// This should compile without errors - demonstrates the types work correctly
const validSpec: Flow<Params> = {
  arrival,

  departure: parameter("departure", {
    description: "City of departure",
    requires: [],
    influencedBy: ['arrival'],
    fetchOptions: async (filters: { arrival?: string }) => {
      const matches = entries.filter(entry =>
        (filters.arrival ? entry.arrival === filters.arrival : true)
      );
      return _.uniq(matches.map(e => e.departure)).map(value => ({ value, id: value }));
    },
    specify: async (value: string, options: OptionChoice<string>[]) => {
      return options[0];
    }
  }),

  date: parameter("date", {
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
    specify: async (value: string, options: OptionChoice<string>[]) => {
      return options[0];
    }
  }),

  passengers: parameter("passengers", {
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
    // specify is omitted
  }),
};