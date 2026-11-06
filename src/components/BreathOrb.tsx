import { useEffect, useRef } from 'react';
import type { Phase } from '../types';

export interface OrbState {
  /** 0 = helt utandad (liten), 1 = helt inandad (stor). */
  level: number;
  phase: Phase;
}

interface Props {
  /** Anropas varje frame – ska vara billig. */
  getState: (now: number) => OrbState;
}

type RGB = [number, number, number];

interface Palette {
  core: RGB;
  mid: RGB;
  edge: RGB;
  glow: RGB;
  particle: RGB;
}

const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const PALETTES: Record<'breath' | 'retention' | 'recovery' | 'finished', Palette> = {
  breath: {
    core: hex('#e6fbff'),
    mid: hex('#5fd4f4'),
    edge: hex('#1f5fbf'),
    glow: hex('#3fb6ff'),
    particle: hex('#a8ecff'),
  },
  retention: {
    core: hex('#efe6ff'),
    mid: hex('#9a7bff'),
    edge: hex('#3a1f8f'),
    glow: hex('#7a5cff'),
    particle: hex('#cdbdff'),
  },
  recovery: {
    core: hex('#fff6e3'),
    mid: hex('#ffc27a'),
    edge: hex('#d9603b'),
    glow: hex('#ff9f5a'),
    particle: hex('#ffe0b0'),
  },
  finished: {
    core: hex('#eafff4'),
    mid: hex('#7af0c0'),
    edge: hex('#1f8f6a'),
    glow: hex('#4fe0a8'),
    particle: hex('#c0ffe4'),
  },
};

const paletteFor = (phase: Phase): Palette => {
  if (phase === 'retention') return PALETTES.retention;
  if (phase === 'recovery') return PALETTES.recovery;
  if (phase === 'finished') return PALETTES.finished;
  return PALETTES.breath;
};

const rgba = (c: RGB, a: number) =>
  `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a))})`;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpRGB = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

interface Particle {
  angle: number;
  speed: number;
  /** Avstånd utanför orbens kant, som andel av skärmens minsta mått. */
  offset: number;
  size: number;
  twinkle: number;
  phase: number;
}

const makeParticles = (n: number): Particle[] =>
  Array.from({ length: n }, () => ({
    angle: Math.random() * Math.PI * 2,
    speed: (0.02 + Math.random() * 0.08) * (Math.random() < 0.5 ? -1 : 1),
    offset: 0.02 + Math.pow(Math.random(), 1.6) * 0.38,
    size: 0.6 + Math.random() * 1.8,
    twinkle: 0.5 + Math.random() * 2,
    phase: Math.random() * Math.PI * 2,
  }));

/**
 * Den andande orben. Ritas på en canvas med 2D-API:t – tillräckligt för
 * mjuka glöd, ringar och partiklar utan att dra in ett 3D-bibliotek.
 */
export function BreathOrb({ getState }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const getStateRef = useRef(getState);
  getStateRef.current = getState;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const particles = makeParticles(reduceMotion ? 40 : 160);

    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Utjämnade värden så att fasbyten blir mjuka.
    let level = getStateRef.current(performance.now()).level;
    const ringLevels = [level, level, level];
    let pal: Palette = { ...paletteFor(getStateRef.current(performance.now()).phase) };
    let last = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const state = getStateRef.current(now);
      const time = now / 1000;

      // Följ målnivån mjukt (snabbt nog för att kännas synkat).
      level = lerp(level, state.level, 1 - Math.exp(-dt * 14));
      ringLevels.forEach((rl, i) => {
        ringLevels[i] = lerp(rl, level, 1 - Math.exp(-dt * (5 - i * 1.3)));
      });

      const target = paletteFor(state.phase);
      const k = 1 - Math.exp(-dt * 2.2);
      pal = {
        core: lerpRGB(pal.core, target.core, k),
        mid: lerpRGB(pal.mid, target.mid, k),
        edge: lerpRGB(pal.edge, target.edge, k),
        glow: lerpRGB(pal.glow, target.glow, k),
        particle: lerpRGB(pal.particle, target.particle, k),
      };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const m = Math.min(w, h);
      const minR = m * 0.11;
      // Lämna plats för text ovanför och under orben på breda skärmar.
      const maxR = Math.min(m * 0.3, h * 0.24);

      let r = lerp(minR, maxR, level);
      // Lugnt "hjärtslag" under andhållningen, svag puls i viloläge.
      if (state.phase === 'retention') r *= 1 + 0.025 * Math.pow(Math.sin(time * Math.PI * 0.9), 6);
      if (state.phase === 'idle' || state.phase === 'finished') r *= 1 + 0.02 * Math.sin(time * 1.2);

      // --- Bakgrundsnorrsken -------------------------------------------------
      const aur = ctx.createRadialGradient(cx, cy, 0, cx, cy, m * 0.9);
      aur.addColorStop(0, rgba(pal.glow, 0.1 + level * 0.12));
      aur.addColorStop(0.5, rgba(pal.edge, 0.06));
      aur.addColorStop(1, rgba(pal.edge, 0));
      ctx.fillStyle = aur;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'lighter';

      // --- Yttre glöd --------------------------------------------------------
      const glow = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 2.4);
      glow.addColorStop(0, rgba(pal.glow, 0.45));
      glow.addColorStop(0.35, rgba(pal.glow, 0.14));
      glow.addColorStop(1, rgba(pal.glow, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 2.4, 0, Math.PI * 2);
      ctx.fill();

      // --- Ringar som släpar efter (krusningar) ------------------------------
      ringLevels.forEach((rl, i) => {
        const rr = lerp(minR, maxR, rl) * (1.18 + i * 0.2);
        ctx.strokeStyle = rgba(pal.particle, 0.22 - i * 0.06);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.stroke();
      });

      // --- Partiklar ---------------------------------------------------------
      // Vid inandning dras de in mot orben, vid utandning flyter de ut.
      const spread = lerp(1.25, 0.55, level);
      for (const p of particles) {
        p.angle += p.speed * dt * (state.phase === 'retention' ? 0.35 : 1);
        const dist = r + p.offset * m * spread;
        const x = cx + Math.cos(p.angle) * dist;
        const y = cy + Math.sin(p.angle) * dist;
        const tw = 0.5 + 0.5 * Math.sin(time * p.twinkle + p.phase);
        const fadeOut = 1 - p.offset / 0.42;
        ctx.fillStyle = rgba(pal.particle, (0.15 + tw * 0.55) * fadeOut);
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';

      // --- Själva orben ------------------------------------------------------
      const body = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.05, cx, cy, r);
      body.addColorStop(0, rgba(pal.core, 0.95));
      body.addColorStop(0.45, rgba(pal.mid, 0.9));
      body.addColorStop(1, rgba(pal.edge, 0.85));
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Flytande "vätska" inuti orben.
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const a = time * (0.25 + i * 0.11) * (i % 2 ? -1 : 1) + i * 1.7;
        const bx = cx + Math.cos(a) * r * 0.45;
        const by = cy + Math.sin(a * 1.3) * r * 0.45;
        const br = r * (0.55 + 0.15 * Math.sin(time * 0.7 + i));
        const blob = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        blob.addColorStop(0, rgba(i % 2 ? pal.core : pal.glow, 0.22));
        blob.addColorStop(1, rgba(pal.glow, 0));
        ctx.fillStyle = blob;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      ctx.restore();

      // Ljus kant.
      ctx.strokeStyle = rgba(pal.core, 0.35);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 0.75, 0, Math.PI * 2);
      ctx.stroke();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="orb-canvas" aria-hidden="true" />;
}
