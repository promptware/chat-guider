import * as readline from 'readline';
import _ from 'lodash';
import {
  Flow,
  parameter,
  runFlow,
} from '../src/index.js';

// Define the parameter types
type Params = {
  departure: string;
  arrival: string;
  date: string;
  passengers: number;
};

// Sample airline data
const entries = [
  { departure: "London", arrival: "New York", date: "2026-10-01", seats: 100 },
  { departure: "London", arrival: "New York", date: "2026-10-02", seats: 1 },
  { departure: "Berlin", arrival: "New York", date: "2026-10-03", seats: 2 },
  { departure: "Berlin", arrival: "London", date: "2026-10-04", seats: 2 },
  { departure: "Paris", arrival: "Tokyo", date: "2026-10-05", seats: 50 },
  { departure: "New York", arrival: "Los Angeles", date: "2026-10-06", seats: 25 },
];

// Define the airline booking spec
const airlineSpec: Flow<Params> = {
  arrival: parameter("arrival", {
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
  }),

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
    },
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

// CLI interface implementation
function createAskUser(): (question: string) => Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return (question: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(`${question} `, (answer) => {
        resolve(answer.trim());
      });
    });
  };
}

// Main function
async function main() {
  console.log('🛫 Welcome to the Airline Booking Assistant!\n');
  console.log('I\'ll help you find and book a flight. Let me ask you a few questions.\n');

  const askUser = createAskUser();
  
  try {
    console.log('running flow', airlineSpec);
    const result = await runFlow(airlineSpec, askUser);
    
    console.log('\n✅ Great! Here\'s your booking summary:');
    console.log('=====================================');
    console.log(`🛫 Departure: ${result.departure.state.tag === 'specified' ? result.departure.state.value : 'Not specified'}`);
    console.log(`🛬 Arrival: ${result.arrival.state.tag === 'specified' ? result.arrival.state.value : 'Not specified'}`);
    console.log(`📅 Date: ${result.date.state.tag === 'specified' ? result.date.state.value : 'Not specified'}`);
    console.log(`👥 Passengers: ${result.passengers.state.tag === 'specified' ? result.passengers.state.value : 'Not specified'}`);
    console.log('=====================================\n');
    
    // Find the matching flight
    const flight = entries.find(entry => 
      result.departure.state.tag === 'specified' && entry.departure === result.departure.state.value &&
      result.arrival.state.tag === 'specified' && entry.arrival === result.arrival.state.value &&
      result.date.state.tag === 'specified' && entry.date === result.date.state.value
    );
    
    if (flight) {
      console.log(`✈️  Flight found! ${flight.seats} seats available.`);
    }
    
  } catch (error) {
    console.error('❌ Error during booking process:', error);
  } finally {
    process.exit(0);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Goodbye! Thanks for using the Airline Booking Assistant.');
  process.exit(0);
});

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
} 