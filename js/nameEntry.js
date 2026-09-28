// Local per-player identity: not a real account, just a save-slot key. The
// actual save data is already in localStorage (save.js) -- what's missing
// without this is remembering *which name* to load, so reloading always
// looked like it forgot everything even though the save was intact.
const LAST_NAME_KEY = 'wander:lastName';

export function initNameEntry(onReady) {
  const overlay = document.getElementById('name-entry');
  const input = document.getElementById('name-input');
  const form = document.getElementById('name-form');

  try {
    const lastName = localStorage.getItem(LAST_NAME_KEY);
    if (lastName) input.value = lastName;
  } catch (err) {
    console.warn('[nameEntry] could not read last name', err);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = input.value.trim() || 'Wanderer';
    try {
      localStorage.setItem(LAST_NAME_KEY, name);
    } catch (err) {
      console.warn('[nameEntry] could not save last name', err);
    }
    overlay.style.display = 'none';
    onReady(name);
  });

  input.focus();
  input.select();
}
