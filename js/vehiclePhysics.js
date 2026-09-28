// Arcade wheeled-vehicle physics shared by car and bike -- just different
// tunables in CONFIG.vehicles.*. Velocity lags behind heading by an amount
// controlled by "grip"; low grip (handbrake held) is what makes it drift.
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function createVehicleState(x, z, heading = 0) {
  return {
    x,
    z,
    heading,
    velocity: { x: 0, z: 0 },
    steerAngle: 0,
    forwardSpeed: 0, // signed, for wheel spin + HUD later
  };
}

export function updateVehicle(state, cfg, input, dt) {
  const { throttle, steer, brake } = input;

  const targetSteer = steer * cfg.maxSteerAngle;
  state.steerAngle = lerp(state.steerAngle, targetSteer, 1 - Math.exp(-cfg.steerResponse * dt));

  const forward = { x: Math.sin(state.heading), z: Math.cos(state.heading) };
  const forwardSpeed = state.velocity.x * forward.x + state.velocity.z * forward.z;

  // turning bites harder at speed, but never fully zero -- otherwise the
  // vehicle looks broken/unresponsive when you steer from a standstill
  const speedFactor = clamp(Math.abs(forwardSpeed) / cfg.turnSpeedRef, cfg.minTurnFactor, 1);
  const turnDir = forwardSpeed < 0 ? -1 : 1;
  state.heading += state.steerAngle * cfg.turnSpeed * speedFactor * turnDir * dt;

  let targetForwardSpeed = forwardSpeed + throttle * cfg.accel * dt;
  if (brake) targetForwardSpeed *= Math.max(0, 1 - cfg.handbrakeDecel * dt);
  targetForwardSpeed *= Math.max(0, 1 - 0.4 * dt); // rolling drag
  targetForwardSpeed = clamp(targetForwardSpeed, -cfg.reverseSpeed, cfg.maxSpeed);

  const newForward = { x: Math.sin(state.heading), z: Math.cos(state.heading) };
  const desired = { x: newForward.x * targetForwardSpeed, z: newForward.z * targetForwardSpeed };

  const grip = brake ? cfg.driftGrip : cfg.grip;
  const gripT = 1 - Math.exp(-grip * dt);
  state.velocity.x = lerp(state.velocity.x, desired.x, gripT);
  state.velocity.z = lerp(state.velocity.z, desired.z, gripT);

  state.x += state.velocity.x * dt;
  state.z += state.velocity.z * dt;
  state.forwardSpeed = targetForwardSpeed;
}
