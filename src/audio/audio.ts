import type { Settings } from '../game/settings';
import type { Game } from '../game/game';
import { hourOf } from '../sim/core';
import { activeVehicle } from '../sim/vehicle';
import { plateauMask } from '../world/terrain';

// Procedural Web Audio: engine, road, ambience, one-shots and generative music.

interface EngineVoice {
  o1: OscillatorNode;
  o2: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  rough: GainNode;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private noise!: AudioBuffer;
  private engine: EngineVoice | null = null;
  private road: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private wind: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private hum: { gain: GainNode } | null = null;
  private birdT = 2;
  private cricketT = 1;
  private stepT = 0;
  private rattleT = 0;
  private musicNext = 0;
  private musicStep = 0;
  private rpm = 800;

  constructor(private settings: Settings) {}

  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp).connect(c.destination);
    this.musicBus = c.createGain();
    this.sfxBus = c.createGain();
    this.ambBus = c.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.ambBus.connect(this.master);
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noise.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099;
      b1 = 0.963 * b1 + w * 0.2965;
      b2 = 0.57 * b2 + w * 1.0527;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
    }
    // road noise loop
    const rn = this.loopNoise();
    const rf = c.createBiquadFilter();
    rf.type = 'bandpass';
    rf.frequency.value = 400;
    rf.Q.value = 0.6;
    const rg = c.createGain();
    rg.gain.value = 0;
    rn.connect(rf).connect(rg).connect(this.sfxBus);
    this.road = { gain: rg, filter: rf };
    // wind
    const wn = this.loopNoise();
    const wf = c.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 500;
    const wg = c.createGain();
    wg.gain.value = 0.04;
    wn.connect(wf).connect(wg).connect(this.ambBus);
    this.wind = { gain: wg, filter: wf };
    // fridge hum
    const ho = c.createOscillator();
    ho.frequency.value = 58;
    ho.type = 'sine';
    const hg = c.createGain();
    hg.gain.value = 0;
    ho.connect(hg).connect(this.ambBus);
    ho.start();
    this.hum = { gain: hg };
    this.setVolumes(this.settings);
    this.musicNext = c.currentTime + 1.5;
  }

  private loopNoise(): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.start();
    return s;
  }

  setVolumes(st: Settings) {
    this.settings = st;
    if (!this.ctx) return;
    this.master.gain.value = st.master;
    this.musicBus.gain.value = st.music * 0.5;
    this.sfxBus.gain.value = st.sfx;
    this.ambBus.gain.value = st.sfx * 0.8;
  }

  startEngine() {
    if (!this.ctx || this.engine) return;
    const c = this.ctx;
    const o1 = c.createOscillator();
    o1.type = 'sawtooth';
    const o2 = c.createOscillator();
    o2.type = 'square';
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 2;
    const gain = c.createGain();
    gain.gain.value = 0;
    const g2 = c.createGain();
    g2.gain.value = 0.35;
    o1.connect(filter);
    o2.connect(g2).connect(filter);
    const rough = c.createGain();
    rough.gain.value = 0;
    const rn = this.loopNoise();
    const rf = c.createBiquadFilter();
    rf.type = 'bandpass';
    rf.frequency.value = 180;
    rn.connect(rf).connect(rough).connect(filter);
    filter.connect(gain).connect(this.sfxBus);
    o1.start();
    o2.start();
    gain.gain.linearRampToValueAtTime(0.14, c.currentTime + 0.6);
    this.engine = { o1, o2, filter, gain, rough };
    this.thud(0.3);
  }

  stopEngine() {
    if (!this.ctx || !this.engine) return;
    const e = this.engine;
    const t = this.ctx.currentTime;
    e.gain.gain.cancelScheduledValues(t);
    e.gain.gain.linearRampToValueAtTime(0, t + 0.5);
    setTimeout(() => {
      e.o1.stop();
      e.o2.stop();
    }, 700);
    this.engine = null;
  }

  update(dt: number, g: Game) {
    const c = this.ctx;
    if (!c || !g.sim) return;
    const t = c.currentTime;
    const s = g.sim.s;
    const hour = hourOf(s.time.minutes);
    const day = hour > 5.5 && hour < 20;
    // engine
    if (this.engine && g.phys) {
      const p = g.phys;
      const v = Math.abs(p.speed);
      const throttle = g.input.isDown('W') || (g.drive.auto?.throttle ?? 0) > 0 ? 1 : 0;
      const gearRatio = v < 6 ? 2.2 : v < 13 ? 1.4 : v < 21 ? 1.0 : 0.78;
      const target = 750 + v * 90 * gearRatio + throttle * 600;
      this.rpm += (target - this.rpm) * Math.min(1, dt * 4);
      const rough = p.perf?.roughness ?? 0;
      const f = this.rpm / 60 * (g.phys.def.id === 'van' ? 1 : 0.8);
      const wobble = 1 + rough * 0.06 * Math.sin(t * 13);
      this.engine.o1.frequency.setTargetAtTime(f * 0.5 * wobble, t, 0.05);
      this.engine.o2.frequency.setTargetAtTime(f * 0.25 * wobble, t, 0.05);
      this.engine.filter.frequency.setTargetAtTime(300 + this.rpm * 0.35 + throttle * 300, t, 0.08);
      this.engine.gain.gain.setTargetAtTime(0.09 + throttle * 0.07 + v * 0.002, t, 0.1);
      this.engine.rough.gain.setTargetAtTime(rough * 0.9, t, 0.2);
      // rattles from worn suspension on rough ground
      this.rattleT -= dt;
      const vib = (p.perf?.vibration ?? 0) * (0.3 + p.rough);
      if (v > 4 && vib > 0.15 && this.rattleT <= 0) {
        this.rattleT = 0.15 + Math.random() * (1.2 - vib);
        this.click(0.25 + vib * 0.4, 1800 + Math.random() * 1200);
      }
    }
    if (this.road) {
      const v = g.mode === 'drive' && g.phys ? Math.abs(g.phys.speed) : 0;
      const roughS = g.phys?.rough ?? 0;
      this.road.gain.gain.setTargetAtTime(Math.min(0.5, v * 0.012 * (1 + roughS)), t, 0.15);
      this.road.filter.frequency.setTargetAtTime(250 + v * 25 + roughS * 300, t, 0.2);
    }
    // ambience
    if (this.wind) {
      const inside = g.mode === 'interior' || g.mode === 'furnish';
      const forest = plateauMask(g.focus.x, g.focus.z);
      this.wind.gain.gain.setTargetAtTime(inside ? 0.01 : 0.03 + 0.03 * Math.sin(t * 0.15) ** 2 + forest * 0.02, t, 0.5);
      this.wind.filter.frequency.setTargetAtTime(inside ? 250 : 420 + 200 * Math.sin(t * 0.21), t, 0.6);
      if (this.hum) {
        const v = activeVehicle(s);
        this.hum.gain.gain.setTargetAtTime(inside && (v.batteryWh > 1 || v.hookups.power) ? 0.012 : 0, t, 0.4);
      }
      if (!inside && g.mode !== 'drive') {
        this.birdT -= dt;
        this.cricketT -= dt;
        if (day && this.birdT <= 0) {
          this.birdT = 2 + Math.random() * 6;
          this.bird(forest > 0.3);
        }
        if (!day && this.cricketT <= 0) {
          this.cricketT = 0.4 + Math.random() * 1.2;
          this.cricket();
        }
      }
    }
    this.scheduleMusic(g);
  }

  // ── one-shots ──

  private env(node: AudioNode, gain: number, a: number, d: number, when = 0): GainNode {
    const c = this.ctx!;
    const g = c.createGain();
    const t = c.currentTime + when;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    node.connect(g).connect(this.sfxBus);
    return g;
  }

  private tone(freq: number, type: OscillatorType, gain: number, a: number, d: number, when = 0, slideTo?: number) {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime + when);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + when + a + d);
    this.env(o, gain, a, d, when);
    o.start(c.currentTime + when);
    o.stop(c.currentTime + when + a + d + 0.05);
  }

  private burst(freq: number, q: number, gain: number, dur: number, type: BiquadFilterType = 'bandpass', when = 0) {
    if (!this.ctx) return;
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    s.connect(f);
    this.env(f, gain, 0.005, dur, when);
    s.start(c.currentTime + when, Math.random() * 1.5);
    s.stop(c.currentTime + when + dur + 0.1);
  }

  click(gain = 0.3, freq = 1200) {
    this.tone(freq, 'triangle', gain * 0.25, 0.002, 0.05);
  }

  cash() {
    this.tone(1320, 'triangle', 0.12, 0.005, 0.12);
    this.tone(1760, 'triangle', 0.12, 0.005, 0.25, 0.09);
  }

  chime() {
    [784, 988, 1175].forEach((f, i) => this.tone(f, 'sine', 0.09, 0.01, 0.6, i * 0.12));
  }

  error() {
    this.tone(220, 'square', 0.05, 0.005, 0.18);
    this.tone(180, 'square', 0.05, 0.005, 0.2, 0.12);
  }

  door() {
    this.burst(500, 1.2, 0.35, 0.12);
    this.tone(90, 'sine', 0.25, 0.005, 0.18, 0.08);
  }

  thud(v: number) {
    this.tone(70, 'sine', 0.4 * v + 0.1, 0.005, 0.25);
    this.burst(220, 0.8, 0.3 * v + 0.05, 0.2);
  }

  honk(x: number, z: number) {
    void x;
    void z;
    this.tone(415, 'sawtooth', 0.05, 0.02, 0.35);
    this.tone(523, 'sawtooth', 0.04, 0.02, 0.35);
  }

  water() {
    this.burst(2400, 0.4, 0.12, 1.4, 'highpass');
  }

  pump() {
    this.burst(900, 2, 0.08, 1.2);
    this.tone(1046, 'sine', 0.05, 0.01, 0.12, 1.2);
  }

  stove() {
    this.burst(3000, 0.5, 0.06, 0.8, 'highpass');
    this.click(0.5, 2400);
  }

  footstep(surface: string) {
    const f = surface === 'wood' ? 380 : surface === 'gravel' || surface === 'dirt' ? 1400 : surface === 'grass' ? 900 : surface === 'sand' ? 1100 : 700;
    this.burst(f, surface === 'wood' ? 3 : 1.4, surface === 'wood' ? 0.22 : 0.1, 0.07);
  }

  footstepTick(dt: number, speed: number, surface: string) {
    this.stepT -= dt;
    if (this.stepT <= 0 && speed > 0.3) {
      this.stepT = 1 / (1.2 + speed * 0.55);
      this.footstep(surface);
    }
  }

  private bird(forest: boolean) {
    const base = forest ? 2600 + Math.random() * 900 : 1800 + Math.random() * 1200;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.tone(base * (0.9 + Math.random() * 0.25), 'sine', 0.025, 0.01, 0.08, i * 0.11, base * 1.25);
  }

  private cricket() {
    for (let i = 0; i < 3; i++) this.tone(4400, 'square', 0.006, 0.002, 0.03, i * 0.05);
  }

  // ── music ──

  private scheduleMusic(g: Game) {
    const c = this.ctx!;
    if (this.settings.music <= 0.01) return;
    const bpm = g.mode === 'drive' ? 92 : 72;
    const beat = 60 / bpm;
    // C major: I - V - vi - IV
    const chords = [[261.6, 329.6, 392.0], [196.0, 246.9, 293.7], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6]];
    const scale = [523.3, 587.3, 659.3, 784.0, 880.0, 1046.5];
    while (this.musicNext < c.currentTime + 0.6) {
      const t = this.musicNext - c.currentTime;
      const bar = Math.floor(this.musicStep / 8) % 4;
      const step = this.musicStep % 8;
      if (step === 0) {
        for (const f of chords[bar]) this.pad(f, beat * 8, t);
        this.pad(chords[bar][0] / 2, beat * 8, t, 0.02);
      }
      if (Math.random() < (g.mode === 'drive' ? 0.6 : 0.38)) {
        const f = scale[Math.floor(Math.random() * scale.length)];
        this.pluck(f * (Math.random() < 0.2 ? 0.5 : 1), t);
      }
      if (g.mode === 'drive' && step % 2 === 1) this.burstMusic(t);
      this.musicStep++;
      this.musicNext += beat / 2;
    }
  }

  private pad(f: number, dur: number, when: number, gain = 0.016) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const fl = c.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = 900;
    const g = c.createGain();
    const t = c.currentTime + when;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(fl).connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private pluck(f: number, when: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = c.createGain();
    const t = c.currentTime + when;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 1);
  }

  private burstMusic(when: number) {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6000;
    const g = c.createGain();
    const t = c.currentTime + when;
    g.gain.setValueAtTime(0.03, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    s.connect(f).connect(g).connect(this.musicBus);
    s.start(t, Math.random());
    s.stop(t + 0.1);
  }
}
