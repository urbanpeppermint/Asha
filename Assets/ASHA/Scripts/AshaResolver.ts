// AshaResolver.ts — pure functions, no Sync Kit imports

import { MATRIX, ELEMENTS } from './AshaConstants'

export function resolveRound(choices: number[]): number[] {
  const deltas = new Array(choices.length).fill(0)
  for (let i = 0; i < choices.length; i++) {
    for (let j = i + 1; j < choices.length; j++) {
      const r = MATRIX[choices[i]][choices[j]]
      if (r === 1)  { deltas[i]++; deltas[j]-- }
      if (r === -1) { deltas[j]++; deltas[i]-- }
    }
  }
  return deltas
}

export function getVerb(attackerId: number, defenderId: number): string {
  return (ELEMENTS[attackerId].verbs as Record<number, string>)[defenderId] ?? 'defeats'
}

export function getWinnerIndices(deltas: number[]): number[] {
  const max = Math.max(...deltas)
  return deltas.map((d, i) => d === max ? i : -1).filter(i => i !== -1)
}
