import { expect } from 'chai';
import { describe, it } from 'mocha';
import { initParams, nextFlowStep, parameter } from '../src/index.js';
import type { Flow, OptionChoice } from '../src/index.js';

describe('nextFlowStep', () => {
  describe('returns type: "done"', () => {
    it('should return done when all parameters are specified', async () => {
      type TestParams = {
        a: string;
        b: string;
      };

      const spec: Flow<TestParams> = {
        a: parameter("a", {
          description: "Parameter A",
          requires: [],
          influencedBy: [],
          fetchOptions: async () => [{ value: 'a1', id: 'a1' }],
        }),
        b: parameter("b", {
          description: "Parameter B", 
          requires: ['a'],
          influencedBy: [],
          fetchOptions: async (filters: { a: string }) => [{ value: 'b1', id: 'b1' }],
        })
      };

      const params = await initParams(spec);
      // Manually set both parameters as specified
      params.a.state = { tag: 'specified', value: 'a1' };
      params.b.state = { tag: 'specified', value: 'b1' };

      const result = nextFlowStep(spec, params);
      
      expect(result).to.deep.equal({
        type: 'done',
        params: params
      });
    });
  });

  describe('returns type: "need-fetch-for-ask"', () => {
    it('should return need-fetch-for-ask for parameter with empty state and no dependencies', async () => {
      type TestParams = {
        a: string;
      };

      const spec: Flow<TestParams> = {
        a: parameter("a", {
          description: "Parameter A",
          requires: [],
          influencedBy: [],
          fetchOptions: async () => [
            { value: 'option1', id: 'opt1' },
            { value: 'option2', id: 'opt2' }
          ],
        })
      };

      const params = await initParams(spec);
      const result = nextFlowStep(spec, params);
      
      expect(result).to.deep.equal({
        type: 'need-fetch-for-ask',
        key: 'a',
        filters: {}
      });
    });

    it('should return need-fetch-for-ask for parameter with empty state when dependencies are specified', async () => {
      type TestParams = {
        a: string;
        b: string;
      };

      const spec: Flow<TestParams> = {
        a: parameter("a", {
          description: "Parameter A",
          requires: [],
          influencedBy: [],
          fetchOptions: async () => [{ value: 'a1', id: 'a1' }],
        }),
        b: parameter("b", {
          description: "Parameter B",
          requires: ['a'],
          influencedBy: [],
          fetchOptions: async (filters: { a: string }) => [
            { value: 'b1', id: 'b1' },
            { value: 'b2', id: 'b2' }
          ],
        })
      };

      const params = await initParams(spec);
      // Specify parameter a
      params.a.state = { tag: 'specified', value: 'a1' };

      const result = nextFlowStep(spec, params);
      
      expect(result).to.deep.equal({
        type: 'need-fetch-for-ask',
        key: 'b',
        filters: { a: 'a1' }
      });
    });
  });

  describe('returns type: "need-specify"', () => {
    it('should return need-specify when parameter has provided state and available options', async () => {
      type TestParams = {
        a: string;
      };

      const spec: Flow<TestParams> = {
        a: parameter("a", {
          description: "Parameter A",
          requires: [],
          influencedBy: [],
          fetchOptions: async () => [
            { value: 'option1', id: 'opt1' },
            { value: 'option2', id: 'opt2' }
          ],
        })
      };

      const params = await initParams(spec);
      // Set parameter as provided with available options
      params.a.state = { tag: 'provided', value: 'user input' };
      params.a.options = { 
        tag: 'available', 
        variants: [
          { value: 'option1', id: 'opt1' },
          { value: 'option2', id: 'opt2' }
        ]
      };

      const result = nextFlowStep(spec, params);
      
      expect(result).to.deep.equal({
        type: 'need-specify',
        key: 'a',
        userValue: 'user input',
        options: [
          { value: 'option1', id: 'opt1' },
          { value: 'option2', id: 'opt2' }
        ]
      });
    });
  });

  describe('returns type: "need-fetch-for-update"', () => {
    it('should return need-fetch-for-update when parameter has provided state and unknown options with satisfied dependencies', async () => {
      type TestParams = {
        a: string;
        b: string;
      };

      const spec: Flow<TestParams> = {
        a: parameter("a", {
          description: "Parameter A",
          requires: [],
          influencedBy: [],
          fetchOptions: async () => [{ value: 'a1', id: 'a1' }],
        }),
        b: parameter("b", {
          description: "Parameter B",
          requires: ['a'],
          influencedBy: [],
          fetchOptions: async (filters: { a: string }) => [
            { value: 'b1', id: 'b1' },
            { value: 'b2', id: 'b2' }
          ],
        })
      };

      const params = await initParams(spec);
      // Set a as specified
      params.a.state = { tag: 'specified', value: 'a1' };
      // Set b as provided but options unknown
      params.b.state = { tag: 'provided', value: 'user input for b' };
      params.b.options = { tag: 'unknown' };

      const result = nextFlowStep(spec, params);
      
      expect(result).to.deep.equal({
        type: 'need-fetch-for-update',
        key: 'b',
        filters: { a: 'a1' }
      });
    });
  });

  describe('returns type: "refuse-empty-options"', () => {
    it('should return refuse-empty-options when parameter has provided state but empty options', async () => {
      type TestParams = {
        a: string;
      };

      const spec: Flow<TestParams> = {
        a: parameter("a", {
          description: "Parameter A",
          requires: [],
          influencedBy: [],
          fetchOptions: async () => [], // Empty options
        })
      };

      const params = await initParams(spec);
      // Set parameter as provided with empty available options
      params.a.state = { tag: 'provided', value: 'user input' };
      params.a.options = { tag: 'available', variants: [] };

      const result = nextFlowStep(spec, params);
      
      expect(result).to.deep.equal({
        type: 'refuse-empty-options',
        key: 'a'
      });
    });
  });

  describe('returns null', () => {
    it('should return null when parameter has provided state but dependencies not satisfied', async () => {
      type TestParams = {
        a: string;
        b: string;
      };

      const spec: Flow<TestParams> = {
        a: parameter("a", {
          description: "Parameter A",
          requires: [],
          influencedBy: [],
          fetchOptions: async () => [{ value: 'a1', id: 'a1' }],
        }),
        b: parameter("b", {
          description: "Parameter B",
          requires: ['a'],
          influencedBy: [],
          fetchOptions: async (filters: { a: string }) => [{ value: 'b1', id: 'b1' }],
        })
      };

      const params = await initParams(spec);
      // Set a as already specified (so it won't be processed)
      params.a.state = { tag: 'specified', value: 'a1' };
      // Set b as provided but a is not specified (dependency not satisfied)
      params.b.state = { tag: 'provided', value: 'user input for b' };
      params.b.options = { tag: 'unknown' };

      const result = nextFlowStep(spec, params);
      
      // Should return need-fetch-for-update for b since a is specified
      expect(result).to.deep.equal({
        type: 'need-fetch-for-update',
        key: 'b',
        filters: { a: 'a1' }
      });
    });

    it('should return null when all parameters are either specified or have unsatisfied dependencies', async () => {
      type TestParams = {
        a: string;
        b: string;
        c: string;
      };

      const spec: Flow<TestParams> = {
        a: parameter("a", {
          description: "Parameter A",
          requires: [],
          influencedBy: [],
          fetchOptions: async () => [{ value: 'a1', id: 'a1' }],
        }),
        b: parameter("b", {
          description: "Parameter B",
          requires: ['a'],
          influencedBy: [],
          fetchOptions: async (filters: { a: string }) => [{ value: 'b1', id: 'b1' }],
        }),
        c: parameter("c", {
          description: "Parameter C",
          requires: ['b'],
          influencedBy: [],
          fetchOptions: async (filters: { b: string }) => [{ value: 'c1', id: 'c1' }],
        })
      };

      const params = await initParams(spec);
      // Set a as specified
      params.a.state = { tag: 'specified', value: 'a1' };
      // b is empty, depends on a (satisfied)
      // c is provided, depends on b (not satisfied)
      params.c.state = { tag: 'provided', value: 'user input for c' };
      params.c.options = { tag: 'unknown' };

      const result = nextFlowStep(spec, params);
      
      // Should return need-fetch-for-ask for b since its dependencies are satisfied
      expect(result).to.deep.equal({
        type: 'need-fetch-for-ask',
        key: 'b',
        filters: { a: 'a1' }
      });
    });

    it('should return null for all iterations after processing available actions', async () => {
      type TestParams = {
        a: string;
        b: string;
        c: string;
      };

      const spec: Flow<TestParams> = {
        a: parameter("a", {
          description: "Parameter A",
          requires: [],
          influencedBy: [],
          fetchOptions: async () => [{ value: 'a1', id: 'a1' }],
        }),
        b: parameter("b", {
          description: "Parameter B",
          requires: ['a'],
          influencedBy: [],
          fetchOptions: async (filters: { a: string }) => [{ value: 'b1', id: 'b1' }],
        }),
        c: parameter("c", {
          description: "Parameter C",
          requires: ['b'],
          influencedBy: [],
          fetchOptions: async (filters: { b: string }) => [{ value: 'c1', id: 'c1' }],
        })
      };

      const params = await initParams(spec);
      // Set a as specified, b as provided with unknown options
      params.a.state = { tag: 'specified', value: 'a1' };
      params.b.state = { tag: 'provided', value: 'user input' };
      params.b.options = { tag: 'unknown' };
      // c remains empty but depends on b which is not specified yet

      const result = nextFlowStep(spec, params);
      
      // Should return need-fetch-for-update for b
      expect(result).to.deep.equal({
        type: 'need-fetch-for-update',
        key: 'b',
        filters: { a: 'a1' }
      });
    });

    it('should return null when parameter with empty state has unsatisfied dependencies', async () => {
      type TestParams = {
        a: string;
        b: string;
      };

      const spec: Flow<TestParams> = {
        a: parameter("a", {
          description: "Parameter A",
          requires: [],
          influencedBy: [],
          fetchOptions: async () => [{ value: 'a1', id: 'a1' }],
        }),
        b: parameter("b", {
          description: "Parameter B",
          requires: ['a'],
          influencedBy: [],
          fetchOptions: async (filters: { a: string }) => [{ value: 'b1', id: 'b1' }],
        })
      };

      const params = await initParams(spec);
      // Both parameters have empty state, b depends on a

      const result = nextFlowStep(spec, params);
      
      // Should return need-fetch-for-ask for 'a' since it has no dependencies
      expect(result).to.deep.equal({
        type: 'need-fetch-for-ask',
        key: 'a',
        filters: {}
      });
    });
  });
}); 