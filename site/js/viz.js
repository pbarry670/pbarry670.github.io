import { planDrone } from "./sim.mjs";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function fit(canvas) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = rect.width;
  const h = rect.height;
  const bw = Math.round(w * dpr);
  const bh = Math.round(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function loop(items) {
  const tick = (now) => {
    for (const item of items) {
      if (!item.on) continue;
      item.frame(now);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const live = [];

export function mountAll() {
  document.querySelectorAll("[data-viz]").forEach((el) => {
    const canvas = el.querySelector("canvas");
    if (!canvas) return;
    const kind = el.dataset.viz;
    const builder = builders[kind];
    if (!builder) return;
    const item = builder(el, canvas);
    live.push(item);
    const io = new IntersectionObserver(
      (entries) => {
        item.on = entries.some((e) => e.isIntersecting);
      },
      { threshold: 0.05 }
    );
    io.observe(el);
  });
  loop(live);
}

const builders = { jetvane: jetvane, mppi: mppi, globe: globe, ddp: ddp, supply: supply };

function readouts(el) {
  const node = el.querySelector("[data-readout]");
  return (text) => {
    if (node) node.textContent = text;
  };
}

function jetvane(el, canvas) {
  const say = readouts(el);
  let theta = 0.22;
  let omega = 0;
  let delta = 0;
  let t = 0;
  const refOf = (time) => {
    const p = time % 14;
    if (p < 3.2) return 0;
    if (p < 8.2) return (5 * Math.PI) / 180;
    return 0;
  };
  return {
    on: true,
    frame() {
      const box = fit(canvas);
      if (!box) return;
      const { ctx, w, h } = box;
      const dt = reduced ? 0 : 0.016;
      t += dt;
      const ref = refOf(t);
      const cmd = clamp(-4.2 * (theta - ref) - 1.15 * omega, -0.52, 0.52);
      delta += ((cmd - delta) / 0.14) * (dt || 0);
      const moment = 2.6 * delta;
      omega += (moment / 0.42 - 0.35 * omega) * (dt || 0);
      theta += omega * (dt || 0);
      drawRocket(ctx, w, h, theta, delta, ref);
      const deg = (r) => `${((r * 180) / Math.PI).toFixed(1)}°`;
      say(`θ ${deg(theta)}   ref ${deg(ref)}   δ ${deg(delta)}`);
    },
  };
}

function drawRocket(ctx, w, h, theta, delta, ref) {
  ctx.clearRect(0, 0, w, h);
  drawGrid(ctx, w, h);
  ctx.save();
  ctx.translate(w * 0.52, h * 0.62);
  ctx.rotate(theta);
  const scale = Math.min(w, h) / 420;
  ctx.scale(scale, scale);

  // Exhaust, bent by the vane deflection.
  const plume = ctx.createLinearGradient(0, 70, 0, 168);
  plume.addColorStop(0, "rgba(226,161,90,0.85)");
  plume.addColorStop(1, "rgba(226,161,90,0)");
  ctx.save();
  ctx.translate(0, 78);
  ctx.rotate(-delta * 0.85);
  ctx.fillStyle = plume;
  ctx.beginPath();
  ctx.moveTo(-10, 0);
  ctx.lineTo(10, 0);
  ctx.lineTo(22, 86);
  ctx.lineTo(-22, 86);
  ctx.fill();
  ctx.restore();

  // Body
  ctx.fillStyle = "#d9d3c6";
  ctx.strokeStyle = "#8a8378";
  ctx.lineWidth = 2;
  roundRect(ctx, -16, -120, 32, 196, 8);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-16, -108);
  ctx.lineTo(0, -156);
  ctx.lineTo(16, -108);
  ctx.closePath();
  ctx.fillStyle = "#efeae1";
  ctx.fill();
  ctx.stroke();

  // Fins
  ctx.fillStyle = "#1b242c";
  ctx.beginPath();
  ctx.moveTo(-16, 40);
  ctx.lineTo(-42, 78);
  ctx.lineTo(-16, 70);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(16, 40);
  ctx.lineTo(42, 78);
  ctx.lineTo(16, 70);
  ctx.fill();

  // Jet vanes in the nozzle plane.
  ctx.save();
  ctx.translate(0, 74);
  ctx.strokeStyle = "#e3a45c";
  ctx.fillStyle = "#e3a45c";
  ctx.lineWidth = 3;
  for (const sign of [-1, 1]) {
    ctx.save();
    ctx.translate(sign * 8, 0);
    ctx.rotate(sign * delta);
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(7, 0);
    ctx.lineTo(0, 16);
    ctx.lineTo(-7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // Reference tick
  ctx.restore();
  ctx.save();
  ctx.translate(w * 0.52, h * 0.62);
  ctx.rotate(ref);
  ctx.strokeStyle = "rgba(143,208,198,0.85)";
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 18);
  ctx.lineTo(0, -Math.min(w, h) * 0.42);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#8fd0c6";
  ctx.font = "12px IBM Plex Mono, ui-monospace, monospace";
  ctx.fillText("body axis", 16, 22);
  ctx.fillStyle = "#e3a45c";
  ctx.fillText("vanes", 16, 40);
}

function mppi(el, canvas) {
  const say = readouts(el);
  const speedInput = el.querySelector("[data-speed]");
  const Lf = 0.1651;
  const Lr = 0.1651;
  const L = Lf + Lr;
  const center = trackCenter(80);
  let x = 2.6;
  let y = 0;
  let psi = Math.PI / 2;
  let v = 1;
  let steer = 0;
  let rollouts = [];
  let best = null;
  const rng = mulberry32(7);
  let acc = 0;

  function replan(vDes) {
    const N = 28;
    const H = 16;
    const dt = 0.12;
    rollouts = [];
    let bestCost = Infinity;
    best = null;
    for (let n = 0; n < N; n++) {
      let px = x;
      let py = y;
      let ppsi = psi;
      let pv = v;
      let ps = steer;
      const pts = [{ x: px, y: py }];
      let cost = 0;
      const controls = [];
      for (let k = 0; k < H; k++) {
        const dSteer = (rng() * 2 - 1) * 0.55;
        const accel = (rng() * 2 - 1) * 1.1;
        controls.push([dSteer, accel]);
        ps = clamp(ps + dSteer * dt, -0.35, 0.35);
        pv = clamp(pv + accel * dt, 0.2, 2);
        const beta = Math.atan((Lr / L) * Math.tan(ps));
        px += pv * Math.cos(ppsi + beta) * dt;
        py += pv * Math.sin(ppsi + beta) * dt;
        ppsi += ((pv * Math.cos(beta) * Math.tan(ps)) / L) * dt;
        const near = nearest(center, px, py);
        const head = headingAt(center, near.i);
        const headErr = wrap(ppsi - head);
        cost += 6 * near.d * near.d;
        cost += 10 * headErr * headErr;
        cost += 1 * (pv - vDes) * (pv - vDes);
        cost += 0.05 * (ps * ps + accel * accel);
        pts.push({ x: px, y: py });
      }
      const path = { pts, cost, controls };
      rollouts.push(path);
      if (cost < bestCost) {
        bestCost = cost;
        best = path;
      }
    }
  }

  replan(1);
  return {
    on: true,
    frame(now) {
      const vDes = speedInput ? Number(speedInput.value) : 1;
      if (!reduced) acc += 0.016;
      if (acc > 0.09 || rollouts.length === 0) {
        acc = 0;
        if (best) {
          const [dSteer, accel] = best.controls[0];
          const dt = 0.09;
          steer = clamp(steer + dSteer * dt, -0.35, 0.35);
          v = clamp(v + accel * dt, 0.2, 2);
          const beta = Math.atan((Lr / L) * Math.tan(steer));
          x += v * Math.cos(psi + beta) * dt;
          y += v * Math.sin(psi + beta) * dt;
          psi += ((v * Math.cos(beta) * Math.tan(steer)) / L) * dt;
        }
        replan(vDes);
      }
      const box = fit(canvas);
      if (!box) return;
      const { ctx, w, h } = box;
      drawTrack(ctx, w, h, center, rollouts, best, { x, y, psi, v });
      say(`${v.toFixed(2)} m/s   steer ${((steer * 180) / Math.PI).toFixed(0)}°   ${rollouts.length} samples   target ${vDes.toFixed(1)} m/s`);
      void now;
    },
  };
}

function trackCenter(n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    pts.push({ x: 2.55 * Math.cos(a), y: 1.45 * Math.sin(a) });
  }
  return pts;
}

function nearest(center, x, y) {
  let best = Infinity;
  let i = 0;
  center.forEach((p, idx) => {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < best) {
      best = d;
      i = idx;
    }
  });
  return { d: best, i };
}

function headingAt(center, i) {
  const a = center[i];
  const b = center[(i + 1) % center.length];
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function drawTrack(ctx, w, h, center, rollouts, best, car) {
  ctx.clearRect(0, 0, w, h);
  drawGrid(ctx, w, h);
  const s = Math.min(w, h) / 4.6;
  const X = (p) => w / 2 + p * s;
  const Y = (p) => h / 2 - p * s;
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(143,208,198,0.16)";
  ctx.beginPath();
  center.forEach((p, i) => {
    const cmd = i ? "lineTo" : "moveTo";
    ctx[cmd](X(p.x), Y(p.y));
  });
  ctx.closePath();
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = "rgba(176,140,220,0.9)";
  ctx.stroke();
  ctx.setLineDash([]);

  const ranked = rollouts.slice().sort((a, b) => a.cost - b.cost);
  ranked.forEach((path, idx) => {
    const hot = path === best;
    ctx.beginPath();
    path.pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
    ctx.strokeStyle = hot ? "#9cbe7c" : `rgba(120,210,200,${idx < 8 ? 0.55 : 0.18})`;
    ctx.lineWidth = hot ? 2.4 : 1;
    ctx.stroke();
  });

  ctx.save();
  ctx.translate(X(car.x), Y(car.y));
  ctx.rotate(-car.psi);
  ctx.fillStyle = "#e7e1d6";
  ctx.fillRect(-11, -6, 22, 12);
  ctx.fillStyle = "#e36d4f";
  ctx.fillRect(7, -6, 4, 12);
  ctx.restore();
}

function globe(el, canvas) {
  const say = readouts(el);
  let ang = 0.4;
  const planes = [
    { inc: -60, color: "#e3a45c" },
    { inc: 0, color: "#8fd0c6" },
    { inc: 60, color: "#d7d2c8" },
  ];
  const RE = 1;
  const satR = 1.62;
  return {
    on: true,
    frame() {
      if (!reduced) ang += 0.004;
      const box = fit(canvas);
      if (!box) return;
      const { ctx, w, h } = box;
      ctx.clearRect(0, 0, w, h);
      const cx = w * 0.5;
      const cy = h * 0.52;
      const R = Math.min(w, h) * 0.28;
      const project = (x, y, z) => {
        const cyaw = Math.cos(ang);
        const syaw = Math.sin(ang);
        const xr = cyaw * x + syaw * z;
        const zr = -syaw * x + cyaw * z;
        const tilt = 0.45;
        const y2 = Math.cos(tilt) * y - Math.sin(tilt) * zr;
        const z2 = Math.sin(tilt) * y + Math.cos(tilt) * zr;
        const f = 2.6 / (2.6 + z2);
        return { x: cx + xr * R * f, y: cy - y2 * R * f, z: z2, f };
      };

      // Earth
      const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.2, cx, cy, R);
      g.addColorStop(0, "#24343a");
      g.addColorStop(1, "#10161c");
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = "rgba(143,208,198,0.45)";
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = "rgba(143,208,198,0.18)";
      ctx.lineWidth = 1;
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        for (let lon = 0; lon <= 360; lon += 8) {
          const p = llr(lat, lon + ang * 40, RE);
          const q = project(p.x, p.y, p.z);
          if (lon === 0) ctx.moveTo(q.x, q.y);
          else ctx.lineTo(q.x, q.y);
        }
        ctx.stroke();
      }
      ctx.restore();

      const missile = missilePoint(ang);
      const m = project(missile.x, missile.y, missile.z);

      planes.forEach((plane) => {
        for (let k = 0; k < 4; k++) {
          const f = ((k / 4) * 360 + ang * 80) % 360;
          const p = orbitPoint(plane.inc, f, satR);
          const q = project(p.x, p.y, p.z);
          if (sees(p, missile)) {
            ctx.strokeStyle = "rgba(227,164,92,0.35)";
            ctx.beginPath();
            ctx.moveTo(q.x, q.y);
            ctx.lineTo(m.x, m.y);
            ctx.stroke();
          }
          ctx.fillStyle = plane.color;
          ctx.beginPath();
          ctx.arc(q.x, q.y, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Arc behind and ahead
      ctx.beginPath();
      for (let s = 0; s <= 1; s += 0.02) {
        const p = missileAt(s);
        const q = project(p.x, p.y, p.z);
        if (s === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      }
      ctx.strokeStyle = "rgba(227,109,79,0.85)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = "#e36d4f";
      ctx.beginPath();
      ctx.arc(m.x, m.y, 4, 0, Math.PI * 2);
      ctx.fill();

      const phase = missile.phase;
      say(`${phase}   3 planes × 4 sats   alt. compressed`);
    },
  };
}

function llr(latDeg, lonDeg, r) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  return {
    x: r * Math.cos(lat) * Math.cos(lon),
    y: r * Math.sin(lat),
    z: r * Math.cos(lat) * Math.sin(lon),
  };
}

function orbitPoint(incDeg, anomDeg, r) {
  const inc = (incDeg * Math.PI) / 180;
  const f = (anomDeg * Math.PI) / 180;
  const x = r * Math.cos(f);
  const y = r * Math.sin(f) * Math.sin(inc);
  const z = r * Math.sin(f) * Math.cos(inc);
  return { x, y, z };
}

function missileAt(s) {
  // Sample case in missileTrajSolver.m: 38.89 N, 77.04 W → 55.75 N, 37.62 E.
  const a = llr(38.89, -77.04, 1);
  const b = llr(55.75, 37.62, 1);
  const raise = Math.sin(Math.PI * s) * 0.55;
  const x = a.x * (1 - s) + b.x * s;
  const y = a.y * (1 - s) + b.y * s;
  const z = a.z * (1 - s) + b.z * s;
  const n = Math.hypot(x, y, z) || 1;
  const rad = 1 + raise;
  return { x: (x / n) * rad, y: (y / n) * rad, z: (z / n) * rad };
}

function missilePoint(ang) {
  const s = (0.5 + 0.5 * Math.sin(ang * 0.65)) % 1;
  const p = missileAt(s < 0 ? s + 1 : s);
  const phase = s < 0.18 ? "boost" : s > 0.82 ? "reentry" : "midcourse";
  return { ...p, phase };
}

function sees(sat, mis) {
  // Line of sight misses the Earth if the closest point on the segment is outside the sphere.
  const dx = mis.x - sat.x;
  const dy = mis.y - sat.y;
  const dz = mis.z - sat.z;
  const t = clamp(-(sat.x * dx + sat.y * dy + sat.z * dz) / (dx * dx + dy * dy + dz * dz), 0, 1);
  const cx = sat.x + t * dx;
  const cy = sat.y + t * dy;
  const cz = sat.z + t * dz;
  return cx * cx + cy * cy + cz * cz > 1.05 && Math.hypot(mis.x, mis.y, mis.z) > 1.08;
}

function ddp(el, canvas) {
  const say = readouts(el);
  const plan = planDrone();
  let k = 0;
  return {
    on: true,
    frame() {
      if (!reduced) k += 0.45;
      const box = fit(canvas);
      if (!box) return;
      const { ctx, w, h } = box;
      const i = Math.floor(k) % plan.states.length;
      const s = plan.states[i];
      drawDrone(ctx, w, h, plan, s);
      say(`x ${s[0].toFixed(2)} m   y ${s[1].toFixed(2)} m   θ ${((s[2] * 180) / Math.PI).toFixed(0)}°`);
    },
  };
}

function drawDrone(ctx, w, h, plan, state) {
  ctx.clearRect(0, 0, w, h);
  drawGrid(ctx, w, h);
  const pad = 28;
  let minX = 0;
  let maxX = 3.6;
  let minY = 0.2;
  let maxY = 2.6;
  for (const s of plan.states) {
    minX = Math.min(minX, s[0]);
    maxX = Math.max(maxX, s[0]);
    minY = Math.min(minY, s[1]);
    maxY = Math.max(maxY, s[1]);
  }
  const sx = (w - pad * 2) / (maxX - minX);
  const sy = (h - pad * 2) / (maxY - minY);
  const sc = Math.min(sx, sy);
  const X = (x) => pad + (x - minX) * sc;
  const Y = (y) => h - pad - (y - minY) * sc;

  ctx.beginPath();
  plan.states.forEach((s, i) => (i ? ctx.lineTo(X(s[0]), Y(s[1])) : ctx.moveTo(X(s[0]), Y(s[1]))));
  ctx.strokeStyle = "rgba(143,208,198,0.85)";
  ctx.lineWidth = 1.6;
  ctx.stroke();

  for (const o of plan.obstacles) {
    ctx.beginPath();
    ctx.arc(X(o.x), Y(o.y), o.r * sc, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(227,109,79,0.18)";
    ctx.strokeStyle = "rgba(227,109,79,0.8)";
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = "#9cbe7c";
  ctx.fillRect(X(plan.goal[0]) - 4, Y(plan.goal[1]) - 4, 8, 8);

  ctx.save();
  ctx.translate(X(state[0]), Y(state[1]));
  ctx.rotate(-state[2]);
  ctx.strokeStyle = "#efeae1";
  ctx.fillStyle = "#efeae1";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-16, 0);
  ctx.lineTo(16, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-16, 0, 5, 0, Math.PI * 2);
  ctx.arc(16, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const supplyTraj = simulateSupply();

function simulateSupply() {
  // Same ballistic model as Planetary-Supply-Drop edl.cpp / main.cpp.
  const R = 6378000;
  const MU = 3.986e14;
  const Hs = 8420;
  const rho0 = 1.225;
  const g0 = 9.807;
  const dt = 0.25;
  const orb = R + 500000;
  const beta = 2530 / (1.1 * 2.5);
  const chuteH = 5000;
  let V = Math.sqrt(MU / orb);
  let gamma = (5 * Math.PI) / 180;
  let h = 500000;
  let down = 0;
  const pts = [];
  const rho = (alt) => rho0 ** (-alt / Hs);
  const deriv = (Vv, g, hh) => {
    const rh = rho(hh);
    const grav = g0 * (R / (R + hh)) ** 2;
    return [
      (-rh * Vv * Vv) / (2 * beta) + grav * Math.sin(g),
      (-(Vv * Vv) * Math.cos(g)) / (Vv * (R + hh)) + (grav * Math.cos(g)) / Vv,
      -Vv * Math.sin(g),
    ];
  };
  for (let n = 0; n < 20000 && h >= chuteH; n++) {
    if (n % 8 === 0) pts.push({ down: down / 1000, h: h / 1000, V });
    const k1 = deriv(V, gamma, h);
    const k2 = deriv(V + k1[0] * dt / 2, gamma + k1[1] * dt / 2, h + k1[2] * dt / 2);
    const k3 = deriv(V + k2[0] * dt / 2, gamma + k2[1] * dt / 2, h + k2[2] * dt / 2);
    const k4 = deriv(V + k3[0] * dt, gamma + k3[1] * dt, h + k3[2] * dt);
    down += V * Math.cos(gamma) * dt;
    V += (dt * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])) / 6;
    gamma += (dt * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])) / 6;
    h += (dt * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])) / 6;
  }
  pts.push({ down: down / 1000, h: h / 1000, V });
  return pts;
}

function supply(el, canvas) {
  const say = readouts(el);
  let i = 0;
  return {
    on: true,
    frame() {
      if (!reduced) i = (i + 1) % supplyTraj.length;
      const box = fit(canvas);
      if (!box) return;
      const { ctx, w, h } = box;
      ctx.clearRect(0, 0, w, h);
      drawGrid(ctx, w, h);
      const pad = 28;
      let maxX = 0;
      let maxY = 0;
      for (const p of supplyTraj) {
        maxX = Math.max(maxX, p.down);
        maxY = Math.max(maxY, p.h);
      }
      const X = (v) => pad + (v / maxX) * (w - pad * 2);
      const Y = (v) => h - pad - (v / maxY) * (h - pad * 2);
      ctx.beginPath();
      supplyTraj.forEach((p, n) => (n ? ctx.lineTo(X(p.down), Y(p.h)) : ctx.moveTo(X(p.down), Y(p.h))));
      ctx.strokeStyle = "#e36d4f";
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = "rgba(143,208,198,0.7)";
      ctx.beginPath();
      ctx.moveTo(pad, Y(5));
      ctx.lineTo(w - pad, Y(5));
      ctx.stroke();
      ctx.strokeStyle = "rgba(227,164,92,0.8)";
      ctx.beginPath();
      ctx.moveTo(pad, Y(1));
      ctx.lineTo(w - pad, Y(1));
      ctx.stroke();
      ctx.setLineDash([]);
      const p = supplyTraj[Math.min(i, supplyTraj.length - 1)];
      ctx.fillStyle = "#ebe6dc";
      ctx.beginPath();
      ctx.arc(X(p.down), Y(p.h), 4, 0, Math.PI * 2);
      ctx.fill();
      const phase = p.h > 5 ? "ballistic" : "chute deploy";
      say(`${phase}   ${p.h.toFixed(1)} km   ${p.V.toFixed(0)} m/s`);
    },
  };
}

function drawGrid(ctx, w, h) {
  ctx.fillStyle = "#0c1016";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(232,214,176,0.05)";
  ctx.lineWidth = 1;
  const step = 28;
  for (let x = 0; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function wrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

mountAll();
