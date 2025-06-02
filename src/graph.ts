import type { Flow, Parameter } from './types.js';

export function detectRequiresCycles<T extends Record<string, Parameter<any>>>(spec: Flow<T>): string[][] {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(node: string, path: string[]) {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node);
      cycles.push(path.slice(cycleStart));
      return;
    }

    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);

    const requires = spec[node]?.requires ?? [];
    for (const neighbor of requires) {
      // @ts-expect-error: may be a symbol or a number
      dfs(neighbor, [...path, node]);
    }

    inStack.delete(node);
  }

  for (const key of Object.keys(spec)) {
    dfs(key, []);
  }

  return cycles;
} 