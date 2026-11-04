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
  let last = 0;
  const tick = (now) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    for (const item of items) {
      if (!item.on) continue;
      item.frame(dt);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function makeClock(duration) {
  let t = 0;
  let pausing = false;
  let pause = 0;
  return {
    replay() {
      t = 0;
      pausing = false;
      pause = 0;
    },
    step(dt) {
      if (reduced) return { t: duration * 0.72, u: 0.72, playing: false };
      if (!pausing) {
        t += dt;
        if (t >= duration) {
          t = duration;
          pausing = true;
          pause = 1.5;
        }
      } else {
        pause -= dt;
        if (pause <= 0) {
          t = 0;
          pausing = false;
        }
      }
      return { t, u: duration ? t / duration : 0, playing: !pausing };
    },
  };
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
    const replay = el.querySelector("[data-replay]");
    if (replay) replay.addEventListener("click", () => item.replay?.());
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

function jetHistory() {
  let theta = 0.22;
  let omega = 0;
  let delta = 0;
  const dt = 0.02;
  const hist = [];
  const refOf = (time) => {
    if (time < 3.2) return 0;
    if (time < 8.2) return (5 * Math.PI) / 180;
    return 0;
  };
  for (let t = 0; t <= 14.0001; t += dt) {
    const ref = refOf(t);
    const cmd = clamp(-4.2 * (theta - ref) - 1.15 * omega, -0.52, 0.52);
    delta += ((cmd - delta) / 0.14) * dt;
    const moment = 2.6 * delta;
    omega += (moment / 0.42 - 0.35 * omega) * dt;
    theta += omega * dt;
    hist.push({ t, theta, omega, delta, ref });
  }
  return hist;
}

const jetHist = jetHistory();

function jetvane(el, canvas) {
  const say = readouts(el);
  const detail = el.dataset.detail === "1";
  const clock = makeClock(14);
  return {
    on: true,
    replay() {
      clock.replay();
    },
    frame(dt) {
      const box = fit(canvas);
      if (!box) return;
      const { ctx, w, h } = box;
      const step = clock.step(dt);
      const sample = jetHist[Math.min(jetHist.length - 1, Math.floor(step.u * (jetHist.length - 1)))];
      ctx.clearRect(0, 0, w, h);
      if (!detail) {
        drawRocket(ctx, w, h, sample.theta, sample.delta, sample.ref);
      } else {
        drawRocket(ctx, w, h * 0.62, sample.theta, sample.delta, sample.ref);
        drawSeries(ctx, 16, h * 0.66, w - 32, h * 0.3, jetHist, step.u, [
          { key: "ref", color: "#8fd0c6", name: "ref" },
          { key: "theta", color: "#efeae1", name: "pitch" },
          { key: "delta", color: "#e3a45c", name: "vane" },
        ]);
      }
      const deg = (r) => `${((r * 180) / Math.PI).toFixed(1)}°`;
      say(`θ ${deg(sample.theta)}   ref ${deg(sample.ref)}   δ ${deg(sample.delta)}`);
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
  let rng = mulberry32(7);
  let acc = 0;
  const detail = el.dataset.detail === "1";
  const clock = makeClock(10);
  let prevU = 0;
  const errHist = [];

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

  function reset() {
    x = 2.6;
    y = 0;
    psi = Math.PI / 2;
    v = 1;
    steer = 0;
    acc = 0;
    errHist.length = 0;
    rng = mulberry32(7);
    replan(speedInput ? Number(speedInput.value) : 1);
  }

  replan(1);
  return {
    on: true,
    replay() {
      clock.replay();
      reset();
    },
    frame(dt) {
      const vDes = speedInput ? Number(speedInput.value) : 1;
      const step = clock.step(dt);
      if (step.u + 0.02 < prevU) reset();
      prevU = step.u;
      if (step.playing) acc += dt;
      if (step.playing && (acc > 0.09 || rollouts.length === 0)) {
        acc = 0;
        if (best) {
          const [dSteer, accel] = best.controls[0];
          const idt = 0.09;
          steer = clamp(steer + dSteer * idt, -0.35, 0.35);
          v = clamp(v + accel * idt, 0.2, 2);
          const beta = Math.atan((Lr / L) * Math.tan(steer));
          x += v * Math.cos(psi + beta) * idt;
          y += v * Math.sin(psi + beta) * idt;
          psi += ((v * Math.cos(beta) * Math.tan(steer)) / L) * idt;
          errHist.push(nearest(center, x, y).d);
        }
        replan(vDes);
      }
      const box = fit(canvas);
      if (!box) return;
      const { ctx, w, h } = box;
      if (!detail) {
        drawTrack(ctx, w, h, center, rollouts, best, { x, y, psi, v });
      } else {
        ctx.clearRect(0, 0, w, h);
        drawGrid(ctx, w, h);
        drawTrack(ctx, w, h, center, rollouts, best, { x, y, psi, v }, { x: 0, y: 0, w: w * 0.64, h });
        drawErrorStrip(ctx, w * 0.66, 24, w * 0.3, h - 48, errHist, "cross-track (m)");
      }
      const cross = nearest(center, x, y).d;
      say(`${v.toFixed(2)} m/s   steer ${((steer * 180) / Math.PI).toFixed(0)}°   cross-track ${cross.toFixed(2)} m   target ${vDes.toFixed(1)} m/s`);
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

function drawTrack(ctx, w, h, center, rollouts, best, car, view) {
  const vx = view ? view.x : 0;
  const vy = view ? view.y : 0;
  const vw = view ? view.w : w;
  const vh = view ? view.h : h;
  if (!view) {
    ctx.clearRect(0, 0, w, h);
    drawGrid(ctx, w, h);
  }
  const s = Math.min(vw, vh) / 4.6;
  const X = (p) => vx + vw / 2 + p * s;
  const Y = (p) => vy + vh / 2 - p * s;
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
  const detail = el.dataset.detail === "1";
  const clock = makeClock(12);
  const planes = [
    { inc: -60, color: "#e3a45c" },
    { inc: 0, color: "#8fd0c6" },
    { inc: 60, color: "#d7d2c8" },
  ];
  const RE = 1;
  const satR = 1.62;
  return {
    on: true,
    replay() {
      clock.replay();
    },
    frame(dt) {
      const step = clock.step(dt);
      const ang = 0.35 + step.u * 1.15;
      const flight = step.u;
      const box = fit(canvas);
      if (!box) return;
      const { ctx, w, h } = box;
      ctx.clearRect(0, 0, w, h);
      const cx = detail ? w * 0.36 : w * 0.5;
      const cy = h * 0.52;
      const R = Math.min(detail ? w * 0.62 : w, h) * 0.28;
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

      const missile = missileState(flight);
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

      ctx.beginPath();
      for (let s = 0; s <= 1.001; s += 0.02) {
        const p = missileAt(Math.min(1, s));
        const q = project(p.x, p.y, p.z);
        if (s === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      }
      ctx.strokeStyle = "rgba(227,109,79,0.28)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.lineWidth = 2.2;
      for (let k = 0; k < 18; k++) {
        const s0 = flight - (k / 18) * 0.22;
        const s1 = flight - ((k + 1) / 18) * 0.22;
        if (s1 < 0) continue;
        const a = projectVec(project, missileAt(s0));
        const b = projectVec(project, missileAt(s1));
        ctx.strokeStyle = `rgba(227,109,79,${0.9 * (1 - k / 18)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      const ahead = missileAt(Math.min(1, flight + 0.018));
      const qAhead = project(ahead.x, ahead.y, ahead.z);
      drawArrow(ctx, m.x, m.y, Math.atan2(qAhead.y - m.y, qAhead.x - m.x));

      let los = 0;
      planes.forEach((plane) => {
        for (let k = 0; k < 4; k++) {
          const f = ((k / 4) * 360 + ang * 80) % 360;
          const p = orbitPoint(plane.inc, f, satR);
          if (sees(p, missile)) los += 1;
        }
      });

      if (detail) {
        const px = w * 0.7;
        const py = 36;
        const pw = w * 0.26;
        const ph = h - 72;
        ctx.fillStyle = "rgba(12,16,22,0.55)";
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = "rgba(232,214,176,0.2)";
        ctx.strokeRect(px, py, pw, ph);
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
          const ss = i / 40;
          const alt = Math.hypot(missileAt(ss).x, missileAt(ss).y, missileAt(ss).z) - 1;
          const X = px + ss * pw;
          const Y = py + ph - (alt / 0.58) * (ph - 28) - 8;
          if (i) ctx.lineTo(X, Y);
          else ctx.moveTo(X, Y);
        }
        ctx.strokeStyle = "#e36d4f";
        ctx.lineWidth = 1.6;
        ctx.stroke();
        const altNow = Math.hypot(missile.x, missile.y, missile.z) - 1;
        ctx.fillStyle = "#efeae1";
        ctx.beginPath();
        ctx.arc(px + flight * pw, py + ph - (altNow / 0.58) * (ph - 28) - 8, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = "12px IBM Plex Mono, ui-monospace, monospace";
        ctx.fillStyle = "#8fd0c6";
        ctx.fillText("altitude", px + 8, py + 16);
        ctx.fillStyle = "#e3a45c";
        ctx.fillText(`${los} in view`, px + 8, py + 32);
      }

      say(`${missile.phase}   heading from velocity   ${los} sats in view`);
    },
  };
}

function projectVec(project, p) {
  return project(p.x, p.y, p.z);
}

function drawArrow(ctx, x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = "#e36d4f";
  ctx.strokeStyle = "#1a120f";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-8, 6.5);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-8, -6.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
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

function missileState(s) {
  const clamped = Math.max(0, Math.min(1, s));
  const p = missileAt(clamped);
  const phase = clamped < 0.18 ? "boost" : clamped > 0.82 ? "reentry" : "midcourse";
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
  const detail = el.dataset.detail === "1";
  const plan = planDrone();
  const clock = makeClock(Math.max(8, plan.states.length * plan.dt));
  return {
    on: true,
    replay() {
      clock.replay();
    },
    frame(dt) {
      const box = fit(canvas);
      if (!box) return;
      const { ctx, w, h } = box;
      const step = clock.step(dt);
      const i = Math.min(plan.states.length - 1, Math.floor(step.u * (plan.states.length - 1)));
      const s = plan.states[i];
      ctx.clearRect(0, 0, w, h);
      if (!detail) {
        drawDrone(ctx, w, h, plan, s);
      } else {
        drawDrone(ctx, w, h * 0.62, plan, s, { x: 0, y: 0, w, h: h * 0.62 });
        const flown = plan.states.map((state, idx) => ({
          x: state[0],
          y: state[1],
          theta: state[2],
          xref: plan.refs[idx] ? plan.refs[idx][0] : state[0],
          yref: plan.refs[idx] ? plan.refs[idx][1] : state[1],
        }));
        drawSeries(ctx, 16, h * 0.66, w * 0.46, h * 0.3, flown, step.u, [
          { key: "xref", color: "#8fd0c6", name: "x ref" },
          { key: "x", color: "#efeae1", name: "x" },
        ]);
        drawSeries(ctx, w * 0.52, h * 0.66, w * 0.44, h * 0.3, flown, step.u, [
          { key: "yref", color: "#8fd0c6", name: "y ref" },
          { key: "y", color: "#e3a45c", name: "y" },
        ]);
      }
      const gap = plan.obstacles.reduce(
        (min, o) => Math.min(min, Math.hypot(s[0] - o.x, s[1] - o.y) - o.r),
        Infinity
      );
      say(`x ${s[0].toFixed(2)} m   y ${s[1].toFixed(2)} m   θ ${((s[2] * 180) / Math.PI).toFixed(0)}°   clearance ${gap.toFixed(2)} m`);
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

function gauss(rng, mean, std) {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

function chutePath(start, wind) {
  // chuteDynamics: heatshield off, drag on the remaining mass, crossrange from ay, az.
  const R = 6378000;
  const Hs = 8420;
  const rho0 = 1.225;
  const g0 = 9.807;
  const m = 2530 - 500;
  const A = Math.PI * (7.5 / 2) ** 2;
  const CD = 0.8;
  const dt = 0.2;
  const rho = (alt) => rho0 ** (-alt / Hs);
  let vx = start.V;
  let alt = start.h;
  let y = 0;
  let z = 0;
  let vy = 0;
  let vz = 0;
  const path = [{ down: start.down, h: alt / 1000, y: 0, z: 0, V: vx }];
  let steps = 0;
  while (alt >= 1000 && steps < 80000 && vx > 1) {
    const rh = rho(alt);
    const Fd = 0.5 * rh * vx * vx * CD * A;
      const sample = wind();
    const ay = sample.ay;
    const az = sample.az;
    vx += dt * (-Fd / m + g0);
    if (vx < 1) vx = 1;
    alt -= vx * dt;
    vy += ay * dt;
    vz += az * dt;
    y += vy * dt;
    z += vz * dt;
    if (steps % 4 === 0) path.push({ down: start.down, h: alt / 1000, y: y / 1000, z: z / 1000, V: vx });
    steps += 1;
  }
  path.push({ down: start.down, h: Math.max(alt, 1000) / 1000, y: y / 1000, z: z / 1000, V: vx });
  return path;
}

function simulateSupply() {
  // Ballistic entry from Planetary-Supply-Drop edl.cpp / main.cpp, then chuteDynamics.
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
  const ballistic = [];
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
    if (n % 8 === 0) ballistic.push({ down: down / 1000, h: h / 1000, V });
    const k1 = deriv(V, gamma, h);
    const k2 = deriv(V + (k1[0] * dt) / 2, gamma + (k1[1] * dt) / 2, h + (k1[2] * dt) / 2);
    const k3 = deriv(V + (k2[0] * dt) / 2, gamma + (k2[1] * dt) / 2, h + (k2[2] * dt) / 2);
    const k4 = deriv(V + k3[0] * dt, gamma + k3[1] * dt, h + k3[2] * dt);
    down += V * Math.cos(gamma) * dt;
    V += (dt * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])) / 6;
    gamma += (dt * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])) / 6;
    h += (dt * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])) / 6;
  }
  ballistic.push({ down: down / 1000, h: h / 1000, V });
  const start = { down: down / 1000, h, V };
  const nominal = chutePath(start, () => ({ ay: 0.04, az: -0.05 }));
  const rng = mulberry32(4);
  const fans = [];
  for (let i = 0; i < 18; i++) {
    fans.push(chutePath(start, () => ({ ay: gauss(rng, 0.04, 1), az: gauss(rng, -0.05, 1) })));
  }
  return { ballistic, nominal, fans };
}

function supply(el, canvas) {
  const say = readouts(el);
  const detail = el.dataset.detail === "1";
  const clock = makeClock(detail ? 14 : 11);
  return {
    on: true,
    replay() {
      clock.replay();
    },
    frame(dt) {
      const box = fit(canvas);
      if (!box) return;
      const { ctx, w, h } = box;
      const step = clock.step(dt);
      ctx.clearRect(0, 0, w, h);
      drawGrid(ctx, w, h);
      const phase = drawSupply(ctx, w, h, step.u, supplyTraj, detail);
      say(phase);
    },
  };
}

function altFrac(hKm) {
  const knee = 12;
  const low = 0.52;
  if (hKm <= knee) return (hKm / knee) * low;
  return low + ((Math.min(500, hKm) - knee) / (500 - knee)) * (1 - low);
}

function drawSupply(ctx, w, h, u, data, detail) {
  const { ballistic, nominal, fans } = data;
  const ballU = Math.min(1, u / 0.48);
  const chuteU = u < 0.48 ? 0 : (u - 0.48) / 0.52;
  const gap = 14;
  const top = 28;
  const bottom = detail ? h * 0.36 : 16;
  const leftW = (w - gap * 3) * (detail ? 0.46 : 0.56);
  const rightX =  gap + leftW + gap;
  const rightW = w - rightX - gap;
  const plotH = h - top - bottom;
  const maxDown = ballistic[ballistic.length - 1].down;
  const Xd = (d) => gap + (d / maxDown) * leftW;
  const Yd = (alt) => top + plotH - altFrac(alt) * plotH;
  const ballN = Math.max(1, Math.floor(ballU * (ballistic.length - 1)));
  ctx.beginPath();
  for (let i = 0; i <= ballN; i++) {
    const p = ballistic[i];
    if (i) ctx.lineTo(Xd(p.down), Yd(p.h));
    else ctx.moveTo(Xd(p.down), Yd(p.h));
  }
  ctx.strokeStyle = "#e36d4f";
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = "rgba(143,208,198,0.85)";
  ctx.beginPath();
  ctx.moveTo(gap, Yd(5));
  ctx.lineTo(gap + leftW, Yd(5));
  ctx.stroke();
  ctx.strokeStyle = "rgba(227,164,92,0.85)";
  ctx.beginPath();
  ctx.moveTo(gap, Yd(1));
  ctx.lineTo(gap + leftW, Yd(1));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = "12px IBM Plex Mono, ui-monospace, monospace";
  ctx.fillStyle = "#8fd0c6";
  ctx.fillText("chute 5 km", gap + 4, Yd(5) - 6);
  ctx.fillStyle = "#e3a45c";
  ctx.fillText("1 km", gap + 4, Yd(1) - 6);

  const crossMax = 1.6;
  const Xc = (z) => rightX + rightW * (0.5 + z / (2 * crossMax));
  const Yc = (alt) => top + plotH - (Math.max(0, Math.min(8, alt)) / 8) * plotH;
  ctx.strokeStyle = "rgba(143,208,198,0.35)";
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.moveTo(rightX, Yc(5));
  ctx.lineTo(rightX + rightW, Yc(5));
  ctx.stroke();
  ctx.strokeStyle = "rgba(227,164,92,0.45)";
  ctx.beginPath();
  ctx.moveTo(rightX, Yc(1));
  ctx.lineTo(rightX + rightW, Yc(1));
  ctx.stroke();
  ctx.setLineDash([]);
  const shown = chuteU <= 0 ? -1 : Math.max(0, Math.floor(chuteU * (nominal.length - 1)));
  if (shown >= 0) for (const path of fans) {
    ctx.beginPath();
    for (let i = 0; i <= Math.min(shown, path.length - 1); i++) {
      const p = path[i];
      if (i) ctx.lineTo(Xc(p.z), Yc(p.h));
      else ctx.moveTo(Xc(p.z), Yc(p.h));
    }
    ctx.strokeStyle = "rgba(143,208,198,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.beginPath();
  for (let i = 0; i <= shown; i++) {
    const p = nominal[i];
    if (i) ctx.lineTo(Xc(p.z), Yc(p.h));
    else ctx.moveTo(Xc(p.z), Yc(p.h));
  }
  ctx.strokeStyle = "#9cbe7c";
  ctx.lineWidth = 1.8;
  ctx.stroke();

  let marker;
  let label;
  if (chuteU <= 0) {
    marker = ballistic[ballN];
    const dot = { x: Xd(marker.down), y: Yd(marker.h) };
    ctx.fillStyle = "#ebe6dc";
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 4, 0, Math.PI * 2);
    ctx.fill();
    label = `ballistic   ${marker.h.toFixed(1)} km   ${marker.V.toFixed(0)} m/s`;
  } else {
    const p = nominal[Math.min(shown, nominal.length - 1)];
    drawCanopy(ctx, Xc(p.z), Yc(p.h), detail ? 1.15 : 1);
    drawCanopy(ctx, Xd(ballistic[ballistic.length - 1].down), Yd(p.h), 0.85);
    label = `chute open   ${p.h.toFixed(1)} km   ${p.V.toFixed(0)} m/s`;
  }
  ctx.fillStyle = "#d7d2c8";
  ctx.fillText("full descent", gap, 16);
  ctx.fillText("chute, last 8 km", rightX, 16);

  if (detail) {
    const stripY = h * 0.7;
    const stripH = h - stripY - 12;
    drawSpeedStrip(ctx, gap, stripY, w - gap * 2, stripH, ballistic, nominal, chuteU > 0 ? shown : -1, ballN);
  }
  return label;
}

function drawCanopy(ctx, x, y, scale) {
  const w = 20 * scale;
  const rise = 16 * scale;
  ctx.beginPath();
  ctx.moveTo(x - w, y - 10 * scale);
  ctx.quadraticCurveTo(x, y - 10 * scale - rise, x + w, y - 10 * scale);
  ctx.quadraticCurveTo(x, y - 6 * scale, x - w, y - 10 * scale);
  ctx.fillStyle = "rgba(143,208,198,0.55)";
  ctx.fill();
  ctx.strokeStyle = "#e7f6f2";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - w * 0.82, y - 10 * scale);
  ctx.lineTo(x, y + 8 * scale);
  ctx.lineTo(x + w * 0.82, y - 10 * scale);
  ctx.stroke();
  ctx.fillStyle = "#ebe6dc";
  ctx.beginPath();
  ctx.arc(x, y + 8 * scale, 3.4 * scale, 0, Math.PI * 2);
  ctx.fill();
}

function drawSpeedStrip(ctx, x, y, w, h, ballistic, nominal, chuteIndex, ballIndex) {
  ctx.fillStyle = "rgba(12,16,22,0.55)";
  ctx.fillRect(x, y, w, h);
  const pts = ballistic.map((p) => p.V).concat(nominal.map((p) => p.V));
  const maxV = Math.max(...pts);
  const nBall = ballistic.length;
  const X = (i) => x + (i / (pts.length - 1)) * w;
  const Y = (v) => y + h - (v / maxV) * (h - 18) - 6;
  ctx.beginPath();
  pts.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
  ctx.strokeStyle = "#e3a45c";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  const cursor = chuteIndex >= 0 ? nBall + chuteIndex : ballIndex;
  ctx.strokeStyle = "rgba(239,234,225,0.7)";
  ctx.beginPath();
  ctx.moveTo(X(cursor), y + 4);
  ctx.lineTo(X(cursor), y + h - 4);
  ctx.stroke();
  ctx.fillStyle = "#e3a45c";
  ctx.font = "12px IBM Plex Mono, ui-monospace, monospace";
  ctx.fillText("speed, ballistic then chute", x + 6, y + 14);
}

function drawSeries(ctx, x, y, w, h, hist, u, series) {
  ctx.fillStyle = "rgba(12,16,22,0.55)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(232,214,176,0.2)";
  ctx.strokeRect(x, y, w, h);
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series) {
    for (const p of hist) {
      lo = Math.min(lo, p[s.key]);
      hi = Math.max(hi, p[s.key]);
    }
  }
  const span = hi - lo || 1;
  const X = (i) => x + (i / (hist.length - 1)) * w;
  const Y = (v) => y + h - ((v - lo) / span) * (h - 18) - 6;
  series.forEach((s, n) => {
    ctx.beginPath();
    hist.forEach((p, i) => {
      const yy = Y(p[s.key]);
      if (i) ctx.lineTo(X(i), yy);
      else ctx.moveTo(X(i), yy);
    });
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = s.color;
    ctx.font = "11px IBM Plex Mono, ui-monospace, monospace";
    ctx.fillText(s.name, x + 8 + n * 64, y + 14);
  });
  ctx.strokeStyle = "rgba(239,234,225,0.55)";
  ctx.beginPath();
  ctx.moveTo(x + u * w, y);
  ctx.lineTo(x + u * w, y + h);
  ctx.stroke();
}

function drawErrorStrip(ctx, x, y, w, h, hist, name) {
  ctx.fillStyle = "rgba(12,16,22,0.55)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(232,214,176,0.2)";
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "#8fd0c6";
  ctx.font = "12px IBM Plex Mono, ui-monospace, monospace";
  ctx.fillText(name, x + 8, y + 16);
  if (hist.length < 2) return;
  const maxV = Math.max(...hist, 0.05);
  ctx.beginPath();
  hist.forEach((v, i) => {
    const X = x + (i / (hist.length - 1)) * w;
    const Y = y + h - (v / maxV) * (h - 28) - 8;
    if (i) ctx.lineTo(X, Y);
    else ctx.moveTo(X, Y);
  });
  ctx.strokeStyle = "#e36d4f";
  ctx.lineWidth = 1.5;
  ctx.stroke();
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
