import type { TrafficEvent } from "./simulation.ts";

/** Short synthesized effects; no downloads, autoplay, or persistent audio loops. */
export class TrafficAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private sources = new Set<AudioScheduledSourceNode>();
  private lastHorn = -Infinity;
  private lastShot = -Infinity;
  enabled = false;

  async enable(): Promise<boolean> {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = 0.28;
        this.master.connect(this.context.destination);
      }
      this.enabled = true;
      await this.context.resume();
      return this.enabled;
    } catch {
      this.enabled = false;
      return false;
    }
  }

  disable(): void { this.enabled = false; this.stop(); }

  stop(): void {
    for (const source of this.sources) source.stop();
    this.sources.clear();
    this.lastHorn = -Infinity;
    this.lastShot = -Infinity;
  }

  play(event: TrafficEvent): void {
    const ctx = this.context;
    if (!this.enabled || !ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    if (event.kind === "horn" && now - this.lastHorn > 0.65) {
      this.lastHorn = now;
      this.tone(370, 0.22, "sawtooth", 0.09);
      this.tone(490, 0.28, "sawtooth", 0.07);
    } else if (event.kind === "shot" && now - this.lastShot > 0.08) {
      this.lastShot = now;
      this.noise(0.07, 0.24, 1800);
      this.tone(95, 0.07, "triangle", 0.25);
    } else if (event.kind === "crash") {
      this.noise(0.7, 0.65, 1100);
      this.tone(65, 0.55, "triangle", 0.5);
      this.tone(620, 0.65, "sawtooth", 0.045);
    } else if (event.kind === "ram") {
      this.tone(90, 0.45, "sawtooth", 0.08);
    }
  }

  private connect(source: AudioScheduledSourceNode, duration: number, volume: number, filter?: BiquadFilterNode): void {
    const ctx = this.context!;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    if (filter) source.connect(filter).connect(gain);
    else source.connect(gain);
    gain.connect(this.master!);
    this.sources.add(source);
    source.onended = () => { source.disconnect(); filter?.disconnect(); gain.disconnect(); this.sources.delete(source); };
    source.start();
    source.stop(ctx.currentTime + duration + 0.01);
  }

  private tone(frequency: number, duration: number, type: OscillatorType, volume: number): void {
    const oscillator = this.context!.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    this.connect(oscillator, duration, volume);
  }

  private noise(duration: number, volume: number, cutoff: number): void {
    const ctx = this.context!;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    this.connect(source, duration, volume, filter);
  }
}
