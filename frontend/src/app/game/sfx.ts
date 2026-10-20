import { Injectable, signal } from '@angular/core';
import { GameFx } from './engine';

const MUTE_KEY = 'neon.muted';

type Wave = OscillatorType;

/** Tiny chiptune sound effects synthesised with WebAudio — no audio files to ship. */
@Injectable({ providedIn: 'root' })
export class Sfx {
  readonly muted = signal(readMuted());
  private ctx: AudioContext | null = null;

  toggleMute() {
    this.muted.update((m) => !m);
    try {
      localStorage.setItem(MUTE_KEY, this.muted() ? '1' : '0');
    } catch {}
  }

  /** Browsers only allow audio after a user gesture; call this from input handlers. */
  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  play(type: GameFx['type']) {
    if (this.muted()) return;
    this.unlock();
    switch (type) {
      case 'encounter':
        [330, 440, 330, 554, 659].forEach((f, i) => this.tone(f, f, 0.07, 'square', 0.12, i * 0.07));
        break;
      case 'playerHit':
        this.tone(1100, 520, 0.09, 'square', 0.14);
        break;
      case 'enemyHit':
        this.tone(180, 70, 0.18, 'sawtooth', 0.18);
        this.noise(0.12, 0.12);
        break;
      case 'enemyDown':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.08, 'square', 0.12, i * 0.075));
        break;
      case 'playerDown':
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, f * 0.95, 0.18, 'triangle', 0.18, i * 0.16));
        break;
      case 'pickup':
        this.tone(880, 880, 0.05, 'square', 0.1);
        this.tone(1320, 1320, 0.08, 'square', 0.1, 0.05);
        break;
      case 'heal':
        this.tone(440, 880, 0.25, 'triangle', 0.14);
        break;
      case 'fled':
        this.tone(600, 1400, 0.18, 'square', 0.08);
        break;
      case 'fail':
        this.tone(220, 200, 0.15, 'square', 0.12);
        break;
    }
  }

  private tone(from: number, to: number, duration: number, wave: Wave, volume: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private noise(duration: number, volume: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.buffer = buffer;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }
}

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}
