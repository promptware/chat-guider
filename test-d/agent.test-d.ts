import { Flow, Parameter, ParameterValues } from "../src/types";
import { parameter } from "../src/runtime";
import { AgentBase, flow } from "../src/agent";
import _ from 'lodash';

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
})

// This should compile without errors - demonstrates the types work correctly
const bookFlightSpec: Flow<Params> = {
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
  }),
};

class TouristAgencyAgent extends AgentBase {
  async getName(): Promise<string> {
    return "Tourist Agency Agent";
  }

  async getDescription(): Promise<string> {
    return "Everything for your travel";
  }

  @flow(bookFlightSpec)
  public bookFlight ({arrival, departure, date, passengers}: ParameterValues<Params>) {
    console.log('bookFlight', arrival, departure, date, passengers);
  }
}

const agentInstance = new TouristAgencyAgent();
agentInstance.run();