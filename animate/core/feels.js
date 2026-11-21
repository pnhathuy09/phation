// GENERATED from src/feels.js by scripts/sync-animate.mjs. Edit the source, not this copy.
// Named motion personalities, shared by the Studio (applies them to every value of an entry) and the landing.
// spring = every spring; ease / out = curves (out for exit-like ones); time = multiplier for durations, delays, staggers.
export const FEELS = [
  { id: 'calm', name: 'Calm', hint: 'Slow, soft, no bounce', spring: { stiffness: 120, damping: 26, mass: 1 }, ease: [0.22, 1, 0.36, 1], out: [0.4, 0, 0.6, 1], time: 1.4 },
  { id: 'fluid', name: 'Fluid', hint: 'Smooth glide', spring: { stiffness: 170, damping: 22, mass: 1 }, ease: [0.16, 1, 0.3, 1], out: [0.7, 0, 0.84, 0], time: 1.1 },
  { id: 'snappy', name: 'Snappy', hint: 'Quick and crisp', spring: { stiffness: 420, damping: 32, mass: 1 }, ease: [0.2, 1, 0.4, 1], out: [0.5, 0, 0.75, 0], time: 0.7 },
  { id: 'playful', name: 'Playful', hint: 'Bounces past, settles', spring: { stiffness: 400, damping: 16, mass: 1 }, ease: [0.34, 1.56, 0.64, 1], out: [0.36, 0, 0.66, -0.56], time: 1 },
  { id: 'heavy', name: 'Heavy', hint: 'Slow start, real weight', spring: { stiffness: 200, damping: 34, mass: 2.4 }, ease: [0.7, 0, 0.2, 1], out: [0.8, 0, 0.9, 0.3], time: 1.5 },
  { id: 'mechanical', name: 'Mechanical', hint: 'Even, precise, exact', spring: { stiffness: 800, damping: 60, mass: 1 }, ease: [0.45, 0, 0.55, 1], out: [0.45, 0, 0.55, 1], time: 0.85 },
]
