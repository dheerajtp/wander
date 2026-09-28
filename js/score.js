// Points system: wired everywhere, shown nowhere. Flip SHOW_SCORE to reveal
// a bare-bones debug readout -- there is no other UI for this on purpose.
export const SHOW_SCORE = false;

const log = [];
const listeners = [];
let total = 0;

export const Score = {
  get total() {
    return total;
  },
  get log() {
    return log;
  },
  add(type, amount, meta = {}) {
    total += amount;
    const entry = { type, amount, total, meta, at: Date.now() };
    log.push(entry);
    for (const fn of listeners) fn(entry);
    return entry;
  },
  on(fn) {
    listeners.push(fn);
  },
};
