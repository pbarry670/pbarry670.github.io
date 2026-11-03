#!/usr/bin/env python3
"""Dark-theme figures reimplemented from the public repos.

Outputs are illustrations of those models, not screenshots of Patrick's MATLAB runs.
"""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "img" / "generated"
OUT.mkdir(parents=True, exist_ok=True)

BG = "#090b10"
GRID = "#1c2430"
CREAM = "#ebe6dc"
MUTED = "#9a9488"
AMBER = "#e3a45c"
CYAN = "#8fd0c6"
GREEN = "#9cbe7c"
HOT = "#e36d4f"


def save(fig, name):
    png = OUT / f"{name}.png"
    fig.savefig(png, dpi=160, facecolor=BG, bbox_inches="tight", pad_inches=0.25)
    plt.close(fig)
    im = Image.open(png).convert("RGB")
    webp = OUT / f"{name}.webp"
    im.save(webp, "WEBP", quality=82, method=6)
    png.unlink()
    print(webp, webp.stat().st_size // 1024, "KB")


def mppi():
    """Kinematic bicycle rollouts. Lf = Lr = 0.1651 m, costs from MPPIControl.py."""
    rng = np.random.default_rng(7)
    lf = lr = 0.1651
    length = lf + lr
    n_traj, horizon, dt = 36, 18, 0.1
    v_des = 1.0
    t = np.linspace(0, 2 * np.pi, 120, endpoint=False)
    center = np.stack([3.1 * np.cos(t), 1.7 * np.sin(t)], axis=1)
    # Start on the bottom of the oval, heading along +x after the tangent.
    x = np.array([3.1, 0.0, np.pi / 2, 0.9, 0.0])

    def nearest(px, py):
        d = np.hypot(center[:, 0] - px, center[:, 1] - py)
        i = int(np.argmin(d))
        j = (i + 1) % len(center)
        heading = np.arctan2(center[j, 1] - center[i, 1], center[j, 0] - center[i, 0])
        return d[i], heading

    paths = []
    for _ in range(n_traj):
        px, py, psi, v, steer = x
        pts = [(px, py)]
        cost = 0.0
        for _k in range(horizon):
            d_steer = rng.normal(0, 0.45)
            accel = rng.normal(0, 0.7)
            steer = np.clip(steer + d_steer * dt, -0.35, 0.35)
            v = np.clip(v + accel * dt, 0.2, 2.0)
            beta = np.arctan((lr / length) * np.tan(steer))
            px = px + v * np.cos(psi + beta) * dt
            py = py + v * np.sin(psi + beta) * dt
            psi = psi + (v * np.cos(beta) * np.tan(steer) / length) * dt
            dist, head = nearest(px, py)
            head_err = (psi - head + np.pi) % (2 * np.pi) - np.pi
            cost += 6 * dist**2 + 10 * head_err**2 + 1 * (v - v_des) ** 2
            pts.append((px, py))
        paths.append((cost, np.array(pts)))
    paths.sort(key=lambda item: item[0])

    fig, ax = plt.subplots(figsize=(8.2, 5.4), facecolor=BG)
    ax.set_facecolor(BG)
    ax.plot(center[:, 0], center[:, 1], color=CYAN, lw=1.2, ls=(0, (2, 2)), alpha=0.9)
    # A faint inner/outer wall so the oval reads as a track.
    for scale, alpha in ((1.18, 0.35), (0.82, 0.35)):
        ax.plot(center[:, 0] * scale, center[:, 1] * scale, color=GRID, lw=6, alpha=alpha, solid_capstyle="round")
    for cost, pts in paths[8:]:
        ax.plot(pts[:, 0], pts[:, 1], color=CYAN, lw=0.7, alpha=0.22)
    for cost, pts in paths[1:8]:
        ax.plot(pts[:, 0], pts[:, 1], color=CYAN, lw=1.0, alpha=0.55)
    ax.plot(paths[0][1][:, 0], paths[0][1][:, 1], color=GREEN, lw=2.2)
    ax.scatter([x[0]], [x[1]], s=46, color=CREAM, zorder=5)
    ax.set_aspect("equal")
    ax.axis("off")
    save(fig, "mppi-rollouts")


def constellation():
    """Three MEO planes from the custom design in BallisticMissileTracking/runSim.m."""
    fig, ax = plt.subplots(figsize=(8.2, 5.6), facecolor=BG)
    ax.set_facecolor(BG)
    earth = plt.Circle((0, 0), 1, color="#142028", zorder=1)
    ax.add_patch(earth)
    rim = plt.Circle((0, 0), 1, fill=False, ec=CYAN, lw=1.0, alpha=0.7, zorder=2)
    ax.add_patch(rim)
    tilt = np.deg2rad(28)
    for lat in range(-60, 90, 30):
        phi = np.linspace(0, 2 * np.pi, 160)
        rr = np.cos(np.deg2rad(lat))
        yy = np.full_like(phi, np.sin(np.deg2rad(lat)))
        xs = rr * np.cos(phi)
        zs = rr * np.sin(phi)
        px = xs
        py = yy * np.cos(tilt) - zs * np.sin(tilt)
        front = np.cos(phi) > -0.15
        ax.plot(px[front], py[front], color=CYAN, lw=0.45, alpha=0.28, zorder=2)

    def project(x, y, z):
        # Yaw the scene a little so the planes separate.
        yaw = np.deg2rad(28)
        xr = np.cos(yaw) * x + np.sin(yaw) * z
        zr = -np.sin(yaw) * x + np.cos(yaw) * z
        return xr, y * np.cos(tilt) - zr * np.sin(tilt)

    colors = [AMBER, CYAN, CREAM]
    radius = 1.55
    for inc, color in zip((-60, 0, 60), colors):
        f = np.linspace(0, 2 * np.pi, 240)
        inc_r = np.deg2rad(inc)
        x = radius * np.cos(f)
        y = radius * np.sin(f) * np.sin(inc_r)
        z = radius * np.sin(f) * np.cos(inc_r)
        px, py = project(x, y, z)
        ax.plot(px, py, color=color, lw=0.8, alpha=0.8, zorder=3)
        for k in range(4):
            fk = 2 * np.pi * k / 4
            sx = radius * np.cos(fk)
            sy = radius * np.sin(fk) * np.sin(inc_r)
            sz = radius * np.sin(fk) * np.cos(inc_r)
            qx, qy = project(sx, sy, sz)
            ax.scatter([qx], [qy], s=18, color=color, zorder=4)

    def ll(lat, lon, r):
        la, lo = np.deg2rad(lat), np.deg2rad(lon)
        return np.array(
            [r * np.cos(la) * np.cos(lo), r * np.sin(la), r * np.cos(la) * np.sin(lo)]
        )

    # Sample launch and target from missileTrajSolver.m.
    a = ll(38.89, -77.04, 1)
    b = ll(55.75, 37.62, 1)
    s = np.linspace(0, 1, 80)
    arc = (1 - s)[:, None] * a + s[:, None] * b
    arc = arc / np.linalg.norm(arc, axis=1)[:, None]
    arc *= (1 + 0.42 * np.sin(np.pi * s))[:, None]
    px, py = project(arc[:, 0], arc[:, 1], arc[:, 2])
    ax.plot(px, py, color=HOT, lw=1.6, zorder=5)
    ax.scatter([px[0], px[-1]], [py[0], py[-1]], s=16, color=HOT, zorder=6)
    ax.set_aspect("equal")
    ax.set_xlim(-2.15, 2.15)
    ax.set_ylim(-1.7, 1.7)
    ax.axis("off")
    save(fig, "constellation")


def supply_descent():
    """Ballistic entry from edl.cpp / main.cpp, then chute cross-range from chuteDynamics."""
    R = 6_378_000.0
    MU = 3.986e14
    Hscale = 8420.0
    rho0 = 1.225
    g0 = 9.807
    dt = 0.05
    orb = R + 500_000.0
    V = math_sqrt = (MU / orb) ** 0.5
    gamma = 5.0 * np.pi / 180.0
    h = 500_000.0
    beta = 2530.0 / (1.1 * 2.5)
    chute_h = 5000.0
    powered_h = 1000.0

    def rho(alt):
        return rho0 ** (-alt / Hscale)

    def dyn(x):
        Vv, g, hh = x
        rh = rho(hh)
        grav = g0 * (R / (R + hh)) ** 2
        Vdot = -rh * Vv * Vv / (2 * beta) + grav * np.sin(g)
        gdot = -(Vv * Vv * np.cos(g)) / (Vv * (R + hh)) + grav * np.cos(g) / Vv
        hdot = -Vv * np.sin(g)
        return np.array([Vdot, gdot, hdot])

    def rk4(x):
        k1 = dyn(x)
        k2 = dyn(x + k1 * dt / 2)
        k3 = dyn(x + k2 * dt / 2)
        k4 = dyn(x + k3 * dt)
        return x + dt * (k1 + 2 * k2 + 2 * k3 + k4) / 6

    x = np.array([V, gamma, h])
    rows = []
    down = 0.0
    t = 0.0
    guard = 0
    while x[2] >= chute_h and guard < 400_000:
        if guard % 40 == 0:
            rows.append((t, down / 1000.0, x[0], np.degrees(x[1]), x[2] / 1000.0))
        down += x[0] * np.cos(x[1]) * dt
        x = rk4(x)
        t += dt
        guard += 1
    rows.append((t, down / 1000.0, x[0], np.degrees(x[1]), x[2] / 1000.0))
    ball = np.array(rows)

    # Chute handoff matches main.cpp: heatshield off, crossrange starts at 0.
    # Each step draws ay, az from the normals in chuteDynamics (mean, std).
    m = 2530.0 - 500.0
    A = np.pi * (7.5 / 2) ** 2
    CD = 0.8
    rng = np.random.default_rng(4)
    ends = []
    paths = []
    for i in range(18):
        vx = float(x[0])
        alt = float(x[2])
        vy = 0.0
        vz = 0.0
        y = 0.0
        z = 0.0
        path = [(y, z, alt)]
        steps = 0
        while alt >= powered_h and steps < 80_000 and vx > 1:
            rh = rho(alt)
            Fd = 0.5 * rh * vx * vx * CD * A
            ay = rng.normal(0.04, 1.0)
            az = rng.normal(-0.05, 1.0)
            vx = vx + dt * (-Fd / m + g0)
            if vx < 1:
                vx = 1
            alt = alt - vx * dt
            vy += ay * dt
            vz += az * dt
            y += vy * dt
            z += vz * dt
            if steps % 20 == 0:
                path.append((y, z, alt))
            steps += 1
        path.append((y, z, alt))
        paths.append(np.array(path))
        ends.append((y, z))
    ends = np.array(ends)

    fig, ax = plt.subplots(figsize=(8.2, 5.2), facecolor=BG)
    ax.set_facecolor(BG)
    ax.plot(ball[:, 1], ball[:, 4], color=HOT, lw=1.8)
    ax.axhline(5, color=CYAN, lw=0.8, ls=(0, (2, 3)))
    ax.axhline(1, color=AMBER, lw=0.8, ls=(0, (2, 3)))
    ax.tick_params(colors=MUTED, labelsize=9)
    for spine in ax.spines.values():
        spine.set_color("#2a3340")
    ax.set_xlabel("Downrange (km)", color=CREAM, fontsize=11)
    ax.set_ylabel("Altitude (km)", color=CREAM, fontsize=11)
    ax.set_title("Ballistic descent to chute deploy", color=CREAM, fontsize=13, loc="left", pad=10)
    save(fig, "supply-ballistic")

    fig, ax = plt.subplots(figsize=(7.2, 6.2), facecolor=BG)
    ax.set_facecolor(BG)
    for path in paths:
        ax.plot(path[:, 0] / 1000.0, path[:, 1] / 1000.0, color=CYAN, lw=0.8, alpha=0.55)
        ax.scatter(path[-1, 0] / 1000.0, path[-1, 1] / 1000.0, s=16, color=AMBER, zorder=3)
    ax.scatter([0], [0], s=36, color=GREEN, zorder=4)
    ax.set_aspect("equal")
    ax.tick_params(colors=MUTED, labelsize=9)
    for spine in ax.spines.values():
        spine.set_color("#2a3340")
    ax.set_xlabel("Crossrange y (km)", color=CREAM, fontsize=11)
    ax.set_ylabel("Crossrange z (km)", color=CREAM, fontsize=11)
    ax.set_title("Chute wind samples at powered-descent handoff", color=CREAM, fontsize=13, loc="left", pad=10)
    save(fig, "supply-dispersion")
    print("ballistic end", ball[-1], "dispersion n", len(ends))


if __name__ == "__main__":
    mppi()
    constellation()
    supply_descent()
