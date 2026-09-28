// Save data is keyed by player name -- it's a local save-slot key, not a
// real account (see nameEntry.js). No server, just localStorage.
const STORAGE_PREFIX = 'wander:save:';

export function loadSave(name) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + name);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[save] could not read save data', err);
    return null;
  }
}

export function writeSave(name, data) {
  try {
    localStorage.setItem(STORAGE_PREFIX + name, JSON.stringify({ version: 1, savedAt: Date.now(), ...data }));
  } catch (err) {
    console.warn('[save] could not write save data', err);
  }
}
