const keys = new Set();
const pressHandlers = new Map(); // code -> [handler, ...]

window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab' || e.code === 'Space') e.preventDefault(); // don't shift focus / scroll
  keys.add(e.code);
  if (!e.repeat) firePress(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

function isDown(code) {
  return keys.has(code);
}

function firePress(code) {
  const handlers = pressHandlers.get(code);
  if (handlers) for (const h of handlers) h();
}

// Fires once per physical press, not while held -- for discrete toggles
// like Tab (switch vehicle) or R (camp). Registered handlers are also
// reachable via pressVirtualKey(), which is how the on-screen touch
// buttons trigger the exact same actions as their keyboard equivalents.
export function onKeyPress(code, handler) {
  if (!pressHandlers.has(code)) pressHandlers.set(code, []);
  pressHandlers.get(code).push(handler);
}

// -- touch/virtual input, shared with real keydown/keyup above -----------
export function setVirtualKey(code, down) {
  if (down) {
    keys.add(code);
    firePress(code);
  } else {
    keys.delete(code);
  }
}

export function getDriveInput() {
  const throttle =
    (isDown('KeyW') || isDown('ArrowUp') ? 1 : 0) - (isDown('KeyS') || isDown('ArrowDown') ? 1 : 0);
  const steer =
    (isDown('KeyD') || isDown('ArrowRight') ? 1 : 0) - (isDown('KeyA') || isDown('ArrowLeft') ? 1 : 0);
  const brake = isDown('Space');
  return { throttle, steer, brake };
}
