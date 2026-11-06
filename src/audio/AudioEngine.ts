import type { BackgroundSound } from '../types';

export type Mood = 'calm' | 'breathing' | 'retention' | 'recovery';

/** D-dur pentatonisk – låter alltid harmoniskt oavsett ordning. */
const CHIME_NOTES = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25, 739.99];
/** Bordun: D2, A2, D3, A3, E4 (öppna kvinter, lugnt och "svävande"). */
const DRONE_NOTES = [73.42, 110.0, 146.83, 220.0, 329.63];

/**
 * Allt ljud genereras i realtid med Web Audio API:
 *  - "ambient": svävande bordun + glesa klockspelstoner i ett stort rum
 *  - "ocean":   vågor av brus som rullar in och ut + svag bordun
 *  - andningsljud: filtrerat brus som följer in- och utandning
 *  - klockor som markerar faserna
 *
 * Inga ljudfiler behövs, och inget kan krocka med upphovsrätt.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private musicBus!: GainNode;
  private breathGain!: GainNode;
  private breathFilter!: BiquadFilterNode;
  private padFilter!: BiquadFilterNode;

  private background: BackgroundSound = 'none';
  private backgroundNodes: AudioNode[] = [];
  private backgroundSources: (OscillatorNode | AudioBufferSourceNode)[] = [];
  private backgroundGain: GainNode | null = null;
  private chimeTimer: ReturnType<typeof setTimeout> | null = null;

  private breathSoundOn = true;
  private volume = 0.7;
  private mood: Mood = 'calm';
  private muted = false;
  /** Ökas vid varje init/suspend så att en fördröjd paus kan avbrytas. */
  private generation = 0;

  /** Måste anropas från en användarinteraktion (klick) p.g.a. autoplay-regler. */
  async init() {
    this.generation++;
    // Måste ske synkront i klicket, före första await.
    unlockIOSPlayback();
    if (this.ctx) {
      if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
      return;
    }
    const Ctx: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;

    // iOS kan pausa ljudet (t.ex. vid samtal eller när appen göms) – återuppta då.
    const resumeIfActive = () => {
      if (document.visibilityState === 'visible' && this.background !== 'none' && ctx.state !== 'running') {
        ctx.resume().catch(() => {});
      }
    };
    ctx.addEventListener('statechange', resumeIfActive);
    document.addEventListener('visibilitychange', resumeIfActive);

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 3;
    this.master.connect(compressor).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(4.5, 2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.9;
    this.reverbSend.connect(this.reverb).connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 1;
    this.musicBus.connect(this.master);
    this.musicBus.connect(this.reverbSend);

    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 900;
    this.padFilter.Q.value = 0.7;
    this.padFilter.connect(this.musicBus);

    // Andningsljud: rosa brus → bandpass → gain
    const breathNoise = ctx.createBufferSource();
    breathNoise.buffer = this.makeNoise(4, 'pink');
    breathNoise.loop = true;
    this.breathFilter = ctx.createBiquadFilter();
    this.breathFilter.type = 'bandpass';
    this.breathFilter.frequency.value = 700;
    this.breathFilter.Q.value = 0.8;
    this.breathGain = ctx.createGain();
    this.breathGain.gain.value = 0;
    breathNoise.connect(this.breathFilter).connect(this.breathGain);
    this.breathGain.connect(this.master);
    const breathVerb = ctx.createGain();
    breathVerb.gain.value = 0.25;
    this.breathGain.connect(breathVerb).connect(this.reverbSend);
    breathNoise.start();

    const bg = this.background;
    this.background = 'none';
    this.setBackground(bg);

    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
  }

  get isReady() {
    return this.ctx !== null;
  }

  setVolume(v: number) {
    this.volume = v;
    if (!this.ctx || this.muted) return;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.15);
  }

  setBreathSound(on: boolean) {
    this.breathSoundOn = on;
    if (!on && this.ctx) this.breathGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
  }

  setBackground(type: BackgroundSound) {
    if (type === this.background) return;
    this.background = type;
    if (!this.ctx) return;
    this.stopBackground();
    if (type === 'ambient') this.startAmbient();
    if (type === 'ocean') this.startOcean();
  }

  /** Ändrar karaktären på musiken beroende på fas. */
  setMood(mood: Mood) {
    this.mood = mood;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const cutoff = { calm: 900, breathing: 1300, retention: 420, recovery: 1800 }[mood];
    this.padFilter.frequency.cancelScheduledValues(now);
    this.padFilter.frequency.setTargetAtTime(cutoff, now, 1.5);
  }

  breathIn(durationSec: number) {
    if (!this.ctx || !this.breathSoundOn) return;
    const now = this.ctx.currentTime;
    const g = this.breathGain.gain;
    const f = this.breathFilter.frequency;
    g.cancelScheduledValues(now);
    f.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    f.setValueAtTime(f.value, now);
    g.linearRampToValueAtTime(0.22, now + durationSec * 0.8);
    g.linearRampToValueAtTime(0.12, now + durationSec);
    f.exponentialRampToValueAtTime(1500, now + durationSec);
  }

  breathOut(durationSec: number) {
    if (!this.ctx || !this.breathSoundOn) return;
    const now = this.ctx.currentTime;
    const g = this.breathGain.gain;
    const f = this.breathFilter.frequency;
    g.cancelScheduledValues(now);
    f.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    f.setValueAtTime(f.value, now);
    g.linearRampToValueAtTime(0.16, now + Math.min(0.25, durationSec * 0.2));
    g.linearRampToValueAtTime(0.0001, now + durationSec * 0.95);
    f.exponentialRampToValueAtTime(450, now + durationSec);
  }

  /** Tyst andningsljud direkt (t.ex. vid andhållning). */
  breathSilence() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.breathGain.gain.cancelScheduledValues(now);
    this.breathGain.gain.setTargetAtTime(0, now, 0.3);
  }

  /** Mjuk klocka/skål som markerar en övergång. */
  bell(baseFreq = 293.66, gain = 0.35) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Partialer som liknar en sångskål.
    const partials: [number, number, number][] = [
      [1, 1, 6],
      [2.01, 0.45, 4],
      [2.99, 0.25, 3],
      [4.17, 0.12, 2],
    ];
    const out = ctx.createGain();
    out.gain.value = gain;
    out.connect(this.master);
    out.connect(this.reverbSend);
    for (const [ratio, amp, decay] of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = baseFreq * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(amp, now + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.connect(g).connect(out);
      osc.start(now);
      osc.stop(now + decay + 0.1);
    }
  }

  /** Tona ut allt och pausa ljudmotorn (t.ex. när man går tillbaka till start). */
  suspend() {
    this.stopBackground();
    this.background = 'none';
    this.breathSilence();
    const ctx = this.ctx;
    if (!ctx) return;
    const gen = ++this.generation;
    setTimeout(() => {
      // Om ett nytt pass hunnit starta ska vi inte pausa.
      if (gen !== this.generation) return;
      if (ctx.state === 'running') ctx.suspend();
      silentAudio?.pause();
    }, 2200);
  }

  // ---------------------------------------------------------------------------

  private startAmbient() {
    const ctx = this.ctx!;
    const out = this.fadeInBus(0.55);

    DRONE_NOTES.forEach((freq, i) => {
      for (const detune of [-7, 7]) {
        const osc = ctx.createOscillator();
        osc.type = i < 2 ? 'sine' : 'triangle';
        osc.frequency.value = freq;
        osc.detune.value = detune;
        const g = ctx.createGain();
        g.gain.value = (i < 2 ? 0.16 : 0.07) / 2;

        // Långsam "andning" i volymen på varje röst så att ljudet lever.
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.03 + i * 0.017 + (detune > 0 ? 0.011 : 0);
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = g.gain.value * 0.6;
        lfo.connect(lfoGain).connect(g.gain);

        osc.connect(g).connect(out);
        osc.start();
        lfo.start();
        this.backgroundSources.push(osc, lfo);
        this.backgroundNodes.push(g, lfoGain);
      }
    });

    // Långsam svepning av filtret.
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.02;
    const sweepGain = ctx.createGain();
    sweepGain.gain.value = 250;
    sweep.connect(sweepGain).connect(this.padFilter.frequency);
    sweep.start();
    this.backgroundSources.push(sweep);
    this.backgroundNodes.push(sweepGain);

    this.scheduleChimes();
  }

  private startOcean() {
    const ctx = this.ctx!;
    const out = this.fadeInBus(0.6);

    // Två lager brus med olika våg-takt ger ett mer naturligt hav.
    const layers: [number, number, number][] = [
      // [vågperiod s, filterfrekvens, nivå]
      [9, 500, 0.55],
      [13, 1100, 0.25],
    ];
    for (const [period, freq, level] of layers) {
      const src = ctx.createBufferSource();
      src.buffer = this.makeNoise(6, 'brown');
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level * 0.5;

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 1 / period;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = level * 0.45;
      lfo.connect(lfoGain).connect(g.gain);
      const lfoF = ctx.createGain();
      lfoF.gain.value = freq * 0.6;
      lfo.connect(lfoF).connect(filter.frequency);

      src.connect(filter).connect(g).connect(this.master);
      g.connect(this.reverbSend);
      src.start();
      lfo.start();
      this.backgroundSources.push(src, lfo);
      this.backgroundNodes.push(filter, g, lfoGain, lfoF);
    }

    // Svag bordun i botten.
    for (const freq of [73.42, 110]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.05;
      osc.connect(g).connect(out);
      osc.start();
      this.backgroundSources.push(osc);
      this.backgroundNodes.push(g);
    }
  }

  private fadeInBus(level: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(level, ctx.currentTime + 4);
    g.connect(this.padFilter);
    this.backgroundGain = g;
    this.backgroundNodes.push(g);
    return g;
  }

  private scheduleChimes() {
    const play = () => {
      if (!this.ctx || this.background !== 'ambient') return;
      const sparse = this.mood === 'retention';
      if (Math.random() < (sparse ? 0.5 : 0.85)) {
        const note = CHIME_NOTES[Math.floor(Math.random() * CHIME_NOTES.length)];
        this.chime(note * (sparse ? 0.5 : 1), sparse ? 0.05 : 0.07);
      }
      const delay = (sparse ? 5000 : 2500) + Math.random() * 4000;
      this.chimeTimer = setTimeout(play, delay);
    };
    this.chimeTimer = setTimeout(play, 2000);
  }

  private chime(freq: number, gain: number) {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 5);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.2 - 0.6;
    g.connect(pan);
    pan.connect(this.musicBus);
    for (const [ratio, amp] of [
      [1, 1],
      [2, 0.2],
      [3.01, 0.06],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * ratio;
      const og = ctx.createGain();
      og.gain.value = amp;
      osc.connect(og).connect(g);
      osc.start(now);
      osc.stop(now + 5.2);
    }
  }

  private stopBackground() {
    if (this.chimeTimer) clearTimeout(this.chimeTimer);
    this.chimeTimer = null;
    const ctx = this.ctx;
    const sources = this.backgroundSources;
    const nodes = this.backgroundNodes;
    this.backgroundSources = [];
    this.backgroundNodes = [];
    if (!ctx) return;
    const fadeGain = this.backgroundGain;
    this.backgroundGain = null;
    if (fadeGain) fadeGain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    // Havsljudet går inte via fadeGain, så tona ut alla gains.
    for (const n of nodes) if (n instanceof GainNode) n.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    setTimeout(() => {
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          /* redan stoppad */
        }
        s.disconnect();
      }
      for (const n of nodes) n.disconnect();
    }, 2000);
  }

  private makeNoise(seconds: number, color: 'pink' | 'brown'): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (color === 'brown') {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        d[i] = last * 3.5;
      }
    } else {
      // Paul Kellets approximation av rosa brus.
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    // Mjuk övergång i loopen så att det inte klickar.
    const fade = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[len - fade + i] = d[len - fade + i] * (1 - k) + d[i] * k;
    }
    return buf;
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }
}

// -----------------------------------------------------------------------------
// iOS: Web Audio tystas av ljudlös-knappen på sidan av telefonen. Två knep gör
// att ljudet behandlas som "media" (som musik/video) och spelas ändå:
//  1. navigator.audioSession.type = 'playback' (Safari 17+)
//  2. en tyst, loopande <audio> som startas i samma klick (äldre iOS)

let silentAudio: HTMLAudioElement | null = null;

function silentWavUrl(): string {
  // 0,5 s tyst 8 kHz mono 8-bit WAV.
  const samples = 4000;
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, 'data');
  v.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function unlockIOSPlayback() {
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  try {
    if (nav.audioSession) nav.audioSession.type = 'playback';
  } catch {
    /* stöds inte */
  }
  try {
    if (!silentAudio) {
      silentAudio = new Audio(silentWavUrl());
      silentAudio.loop = true;
      silentAudio.setAttribute('playsinline', '');
      silentAudio.setAttribute('webkit-playsinline', '');
    }
    silentAudio.play().catch(() => {});
  } catch {
    /* ignorera */
  }
}

/** En delad instans för hela appen. */
export const audio = new AudioEngine();
