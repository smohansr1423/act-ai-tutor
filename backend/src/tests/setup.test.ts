import { describe, it, expect } from 'vitest';

describe('Project Setup', () => {
  it('should have a valid test environment', () => {
    expect(true).toBe(true);
  });

  it('should support TypeScript features', () => {
    interface TestInterface {
      id: string;
      value: number;
    }

    const testObj: TestInterface = { id: 'test-1', value: 42 };
    expect(testObj.id).toBe('test-1');
    expect(testObj.value).toBe(42);
  });

  it('should have fast-check available for property-based testing', async () => {
    const fc = await import('fast-check');
    fc.assert(
      fc.property(fc.integer(), (n) => {
        return typeof n === 'number';
      })
    );
  });
});
