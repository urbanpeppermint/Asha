// AshaConstants.ts — paste verbatim, never modify

export const ELEMENTS = [
  { id: 0, name: 'ATAR',       type: 'Fire',  emoji: '🔥',
    verbs: { 2: 'scorches', 4: 'melts' },     beats: [2, 4], loses: [1, 3] },
  { id: 1, name: 'ABAN',       type: 'Water', emoji: '💧',
    verbs: { 0: 'quenches', 4: 'rusts' },     beats: [0, 4], loses: [2, 3] },
  { id: 2, name: 'ZAM',        type: 'Earth', emoji: '🪨',
    verbs: { 1: 'absorbs', 3: 'blocks' },     beats: [1, 3], loses: [0, 4] },
  { id: 3, name: 'VAYU',       type: 'Wind',  emoji: '🌪️',
    verbs: { 0: 'extinguishes', 1: 'scatters' }, beats: [0, 1], loses: [2, 4] },
  { id: 4, name: 'KHSHATHRA',  type: 'Metal', emoji: '⚔️',
    verbs: { 2: 'cleaves', 3: 'pierces' },    beats: [2, 3], loses: [0, 1] },
]

// MATRIX[attacker][defender]: 1 = attacker wins, -1 = defender wins, 0 = draw
export const MATRIX: number[][] = [
  [ 0, -1,  1, -1,  1],   // ATAR
  [ 1,  0, -1, -1,  1],   // ABAN
  [-1,  1,  0,  1, -1],   // ZAM
  [ 1,  1, -1,  0, -1],   // VAYU
  [-1, -1,  1,  1,  0],   // KHSHATHRA
]
