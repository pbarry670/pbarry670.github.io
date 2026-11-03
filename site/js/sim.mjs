// Planar quadrotor used by the drone illustration.
// Matches drone-ddp/planar_quadrotor.m, with the vertical equation written
// as an acceleration (divided by mass), which is the intended rigid-body model:
//   xdd = -(u1+u2) sin(theta) / m
//   ydd =  (u1+u2) cos(theta) / m - g
//   thetadd = (arm / I) * (u1 - u2)
// The flown path is a closed-loop track of a curve that clears two circles.
// It is an illustration of that model, not a frame from the MATLAB DDP run.

const DRONE = { m: 0.85, I: 0.06, arm: 0.22, g: 9.81, dt: 0.08 };

export function droneScene() {
  return {
    start: [0.15, 0.85, 0, 0, 0, 0],
    goal: [3.35, 1.15, 0, 0, 0, 0],
    obstacles: [
      { x: 1.25, y: 0.95, r: 0.34 },
      { x: 2.25, y: 1.45, r: 0.3 },
    ],
  };
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function step(x, u) {
  const dt = DRONE.dt;
  const [px, py, th, vx, vy, w] = x;
  const thrust = u[0] + u[1];
  const ax = (-thrust * Math.sin(th)) / DRONE.m;
  const ay = (thrust * Math.cos(th)) / DRONE.m - DRONE.g;
  const aw = (DRONE.arm / DRONE.I) * (u[0] - u[1]);
  return [px + dt * vx, py + dt * vy, th + dt * w, vx + dt * ax, vy + dt * ay, w + dt * aw];
}

export function planDrone() {
  const scene = droneScene();
  const N = 120;
  const dt = DRONE.dt;
  const refs = [];
  for (let t = 0; t <= N + 2; t++) {
    const s = Math.min(1, t / N / 0.55);
    const ease = s * s * (3 - 2 * s);
    const x = scene.start[0] + (scene.goal[0] - scene.start[0]) * ease;
    const lift = Math.sin(Math.PI * s) * 1.05;
    const y = scene.start[1] + (scene.goal[1] - scene.start[1]) * ease + lift;
    refs.push([x, y]);
  }

  let x = scene.start.slice();
  const xs = [x.slice()];
  const U = [];
  const push = (u) => {
    U.push(u);
    x = step(x, u);
    xs.push(x.slice());
  };

  for (let t = 0; t < N; t++) {
    const p = refs[t];
    const p1 = refs[t + 1];
    const vdx = (p1[0] - p[0]) / dt;
    const vdy = (p1[1] - p[1]) / dt;
    const ex = p[0] - x[0];
    const ey = p[1] - x[1];
    const evx = vdx - x[3];
    const evy = vdy - x[4];
    const thetaDes = clamp(-0.36 * ex - 0.55 * evx, -0.22, 0.22);
    const cosT = Math.max(0.55, Math.cos(x[2]));
    const thrust = clamp((DRONE.m * (DRONE.g + 2.6 * ey + 3.1 * evy)) / cosT, 0.2, 22);
    const moment = 16 * (thetaDes - x[2]) - 8 * x[5];
    const diff = clamp((moment * DRONE.I) / DRONE.arm, -6, 6);
    push([
      clamp(thrust / 2 + diff / 2, 0.02, 14),
      clamp(thrust / 2 - diff / 2, 0.02, 14),
    ]);
    const goalDist = Math.hypot(x[0] - scene.goal[0], x[1] - scene.goal[1]);
    const speed = Math.hypot(x[3], x[4]);
    if (t > 55 && goalDist < 0.14 && speed < 0.45 && Math.abs(x[2]) < 0.2) break;
  }

  for (let h = 0; h < 36; h++) {
    const ex = scene.goal[0] - x[0];
    const ey = scene.goal[1] - x[1];
    const thetaDes = clamp(-0.45 * ex + 0.7 * x[3], -0.2, 0.2);
    const thrust = clamp(DRONE.m * (DRONE.g + 4 * ey - 5 * x[4]), 0.2, 22);
    const moment = 22 * (thetaDes - x[2]) - 10 * x[5];
    const diff = clamp((moment * DRONE.I) / DRONE.arm, -5, 5);
    push([
      clamp(thrust / 2 + diff / 2, 0.02, 14),
      clamp(thrust / 2 - diff / 2, 0.02, 14),
    ]);
  }

  return {
    states: xs,
    controls: U,
    obstacles: scene.obstacles,
    goal: scene.goal,
    start: scene.start,
    dt: dt,
  };
}

export function clearance(plan) {
  let minGap = Infinity;
  for (const s of plan.states) {
    for (const o of plan.obstacles) {
      minGap = Math.min(minGap, Math.hypot(s[0] - o.x, s[1] - o.y) - o.r);
    }
  }
  const last = plan.states[plan.states.length - 1];
  return {
    minGap,
    end: last,
    goalDist: Math.hypot(last[0] - plan.goal[0], last[1] - plan.goal[1]),
  };
}
