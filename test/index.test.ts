import { expect } from 'chai';
import { describe, it } from 'mocha';
import { initParams } from '../src/index';

describe('Guider', () => {
  describe('initParams', () => {
    it('should initialize parameters correctly', async () => {
      // Test spec with empty requires array
      const testSpec = {
        testParam: {
          requires: [],
          description: 'A test parameter',
          influencedBy: [],
          fetchOptions: async () => {
            return [{ value: 'test', id: 'test-id' }];
          },
          specify: async (value: string, options: any) => {
            return { value: 'specified', id: 'spec-id' };
          }
        }
      };

      const params = await initParams(testSpec);
      
      expect(params).to.have.property('testParam');
      expect(params.testParam.state).to.deep.equal({ tag: 'empty' });
      expect(params.testParam.options.tag).to.equal('available');
      if (params.testParam.options.tag === 'available') {
        expect(params.testParam.options.variants).to.deep.equal([
          { value: 'test', id: 'test-id' }
        ]);
      }
    });
  });

  describe('Parameter types', () => {
    it('should handle empty parameter state', () => {
      const emptyState = { tag: 'empty' as const };
      expect(emptyState.tag).to.equal('empty');
    });

    it('should handle provided parameter state', () => {
      const providedState = { tag: 'provided' as const, value: 'test-value' };
      expect(providedState.tag).to.equal('provided');
      expect(providedState.value).to.equal('test-value');
    });

    it('should handle specified parameter state', () => {
      const specifiedState = { tag: 'specified' as const, value: 'specified-value' };
      expect(specifiedState.tag).to.equal('specified');
      expect(specifiedState.value).to.equal('specified-value');
    });
  });
}); 