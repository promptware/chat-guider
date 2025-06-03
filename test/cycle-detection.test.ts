import { expect } from 'chai';
import { describe, it } from 'mocha';
import { detectRequiresCycles, parameter } from '../src/index.js';
import type { Flow, OptionChoice } from '../src/index.js';

describe('Cycle Detection', () => {
  describe('detectRequiresCycles', () => {
    it('should return empty array for acyclic spec', () => {
      type TestParams = {
        a: string;
        b: string;
        c: string;
      };

      const acyclicSpec: Flow<TestParams> = {
        a: parameter<TestParams, "a", [], []>("a", {
          description: "Parameter A",
          requires: [],
          influencedBy: [],
          fetchOptions: async () => [{ value: 'a', id: 'a' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        }),
        b: parameter<TestParams, "b", ["a"], []>("b", {
          description: "Parameter B", 
          requires: ['a'],
          influencedBy: [],
          fetchOptions: async (filters: { a: string }) => [{ value: 'b', id: 'b' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        }),
        c: parameter<TestParams, "c", ["a", "b"], []>("c", {
          description: "Parameter C",
          requires: ['a', 'b'],
          influencedBy: [],
          fetchOptions: async (filters: { a: string; b: string }) => [{ value: 'c', id: 'c' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        })
      };

      const cycles = detectRequiresCycles(acyclicSpec);
      expect(cycles).to.be.an('array').that.is.empty;
    });

    it('should detect simple 2-node cycle', () => {
      type TestParams = {
        a: string;
        b: string;
      };

      const cyclicSpec: Flow<TestParams> = {
        a: parameter<TestParams, "a", ["b"], []>("a", {
          description: "Parameter A",
          requires: ['b'],
          influencedBy: [],
          fetchOptions: async (filters: { b: string }) => [{ value: 'a', id: 'a' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        }),
        b: parameter<TestParams, "b", ["a"], []>("b", {
          description: "Parameter B",
          requires: ['a'],
          influencedBy: [],
          fetchOptions: async (filters: { a: string }) => [{ value: 'b', id: 'b' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        })
      };

      const cycles = detectRequiresCycles(cyclicSpec);
      expect(cycles).to.have.length(1);
      expect(cycles[0]).to.include.members(['a', 'b']);
    });

    it('should detect 3-node cycle', () => {
      type TestParams = {
        a: string;
        b: string;
        c: string;
      };

      const cyclicSpec: Flow<TestParams> = {
        a: parameter<TestParams, "a", ["c"], []>("a", {
          description: "Parameter A",
          requires: ['c'],
          influencedBy: [],
          fetchOptions: async (filters: { c: string }) => [{ value: 'a', id: 'a' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        }),
        b: parameter<TestParams, "b", ["a"], []>("b", {
          description: "Parameter B",
          requires: ['a'],
          influencedBy: [],
          fetchOptions: async (filters: { a: string }) => [{ value: 'b', id: 'b' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        }),
        c: parameter<TestParams, "c", ["b"], []>("c", {
          description: "Parameter C",
          requires: ['b'],
          influencedBy: [],
          fetchOptions: async (filters: { b: string }) => [{ value: 'c', id: 'c' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        })
      };

      const cycles = detectRequiresCycles(cyclicSpec);
      expect(cycles).to.have.length(1);
      expect(cycles[0]).to.include.members(['a', 'b', 'c']);
    });

    it('should detect multiple separate cycles', () => {
      type TestParams = {
        a: string;
        b: string;
        c: string;
        d: string;
      };

      const multipleCyclesSpec: Flow<TestParams> = {
        // First cycle: a -> b -> a
        a: parameter<TestParams, "a", ["b"], []>("a", {
          description: "Parameter A",
          requires: ['b'],
          influencedBy: [],
          fetchOptions: async (filters: { b: string }) => [{ value: 'a', id: 'a' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        }),
        b: parameter<TestParams, "b", ["a"], []>("b", {
          description: "Parameter B",
          requires: ['a'],
          influencedBy: [],
          fetchOptions: async (filters: { a: string }) => [{ value: 'b', id: 'b' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        }),
        // Second cycle: c -> d -> c
        c: parameter<TestParams, "c", ["d"], []>("c", {
          description: "Parameter C",
          requires: ['d'],
          influencedBy: [],
          fetchOptions: async (filters: { d: string }) => [{ value: 'c', id: 'c' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        }),
        d: parameter<TestParams, "d", ["c"], []>("d", {
          description: "Parameter D",
          requires: ['c'],
          influencedBy: [],
          fetchOptions: async (filters: { c: string }) => [{ value: 'd', id: 'd' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        })
      };

      const cycles = detectRequiresCycles(multipleCyclesSpec);
      expect(cycles).to.have.length(2);
      
      // Check that we found both cycles
      const cycleContents = cycles.map(cycle => cycle.sort()).sort();
      expect(cycleContents).to.deep.include.members([
        ['a', 'b'].sort(),
        ['c', 'd'].sort()
      ]);
    });

    it('should handle complex graph with mixed cycles and acyclic parts', () => {
      type TestParams = {
        root: string;
        a: string;
        b: string;
        c: string;
        leaf: string;
      };

      const complexSpec: Flow<TestParams> = {
        root: parameter<TestParams, "root", [], []>("root", {
          description: "Root parameter",
          requires: [],
          influencedBy: [],
          fetchOptions: async () => [{ value: 'root', id: 'root' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        }),
        // Cycle: a -> b -> c -> a
        a: parameter<TestParams, "a", ["root", "c"], []>("a", {
          description: "Parameter A",
          requires: ['root', 'c'], // depends on root (acyclic) and c (cyclic)
          influencedBy: [],
          fetchOptions: async (filters: { root: string; c: string }) => [{ value: 'a', id: 'a' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        }),
        b: parameter<TestParams, "b", ["a"], []>("b", {
          description: "Parameter B",
          requires: ['a'],
          influencedBy: [],
          fetchOptions: async (filters: { a: string }) => [{ value: 'b', id: 'b' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        }),
        c: parameter<TestParams, "c", ["b"], []>("c", {
          description: "Parameter C",
          requires: ['b'],
          influencedBy: [],
          fetchOptions: async (filters: { b: string }) => [{ value: 'c', id: 'c' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        }),
        leaf: parameter<TestParams, "leaf", ["root"], []>("leaf", {
          description: "Leaf parameter",
          requires: ['root'],
          influencedBy: [],
          fetchOptions: async (filters: { root: string }) => [{ value: 'leaf', id: 'leaf' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        })
      };

      const cycles = detectRequiresCycles(complexSpec);
      expect(cycles).to.have.length(1);
      expect(cycles[0]).to.include.members(['a', 'b', 'c']);
    });

    it('should handle empty spec', () => {
      const emptySpec = {};
      const cycles = detectRequiresCycles(emptySpec);
      expect(cycles).to.be.an('array').that.is.empty;
    });

    it('should handle single node with no dependencies', () => {
      type TestParams = {
        a: string;
      };

      const singleNodeSpec: Flow<TestParams> = {
        a: parameter<TestParams, "a", [], []>("a", {
          description: "Parameter A",
          requires: [],
          influencedBy: [],
          fetchOptions: async () => [{ value: 'a', id: 'a' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        })
      };

      const cycles = detectRequiresCycles(singleNodeSpec);
      expect(cycles).to.be.an('array').that.is.empty;
    });

    it('should detect cycle in a larger DAG with one cycle', () => {
      type TestParams = {
        a: string;
        b: string;
        c: string;
        d: string;
        e: string;
        f: string;
      };

      // Structure: a -> b -> c -> d -> e -> f
      //                      ^         |
      //                      +---------+
      // So there's a cycle: c -> d -> e -> c, while a -> b is acyclic
      const complexDAGSpec: Flow<TestParams> = {
        a: parameter<TestParams, "a", [], []>("a", {
          description: "Parameter A",
          requires: [],
          influencedBy: [],
          fetchOptions: async () => [{ value: 'a', id: 'a' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        }),
        b: parameter<TestParams, "b", ["a"], []>("b", {
          description: "Parameter B",
          requires: ['a'],
          influencedBy: [],
          fetchOptions: async (filters: { a: string }) => [{ value: 'b', id: 'b' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        }),
        c: parameter<TestParams, "c", ["b", "e"], []>("c", {
          description: "Parameter C",
          requires: ['b', 'e'], // Creates cycle with e
          influencedBy: [],
          fetchOptions: async (filters: { b: string; e: string }) => [{ value: 'c', id: 'c' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        }),
        d: parameter<TestParams, "d", ["c"], []>("d", {
          description: "Parameter D",
          requires: ['c'],
          influencedBy: [],
          fetchOptions: async (filters: { c: string }) => [{ value: 'd', id: 'd' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        }),
        e: parameter<TestParams, "e", ["d"], []>("e", {
          description: "Parameter E",
          requires: ['d'],
          influencedBy: [],
          fetchOptions: async (filters: { d: string }) => [{ value: 'e', id: 'e' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        }),
        f: parameter<TestParams, "f", ["e"], []>("f", {
          description: "Parameter F",
          requires: ['e'],
          influencedBy: [],
          fetchOptions: async (filters: { e: string }) => [{ value: 'f', id: 'f' }],
          specify: async (value: string, options: OptionChoice<string>[]) => options[0]
        })
      };

      const cycles = detectRequiresCycles(complexDAGSpec);
      expect(cycles).to.have.length(1);
      expect(cycles[0]).to.include.members(['c', 'd', 'e']);
    });
  });
}); 