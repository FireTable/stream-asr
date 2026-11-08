/**
 * High-quality linear interpolating audio resampler with stateful cross-chunk
 * phase tracking and sample continuity for streaming PCM inputs.
 */
export class AudioResampler {
  private inRate: number;
  private outRate: number;
  private ratio: number;
  private phase: number = 0;
  private lastSample: number = 0;

  constructor(inRate: number, outRate: number = 16000) {
    this.inRate = inRate;
    this.outRate = outRate;
    this.ratio = inRate / outRate;
  }

  public process(input: Float32Array): Float32Array {
    if (this.inRate === this.outRate || input.length === 0) {
      return input;
    }

    const estLen = Math.ceil(input.length / this.ratio) + 2;
    const out = new Float32Array(estLen);
    let outIdx = 0;
    let pos = this.phase;

    while (pos < input.length) {
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const s0 = (idx >= 0 && idx < input.length) ? input[idx] : this.lastSample;
      const s1 = (idx + 1 < input.length) ? input[idx + 1] : s0;
      out[outIdx++] = s0 * (1 - frac) + s1 * frac;
      pos += this.ratio;
    }

    this.phase = Math.max(0, pos - input.length);
    this.lastSample = input.length > 0 ? input[input.length - 1] : 0;
    return out.subarray(0, outIdx);
  }

  public reset(): void {
    this.phase = 0;
    this.lastSample = 0;
  }
}
