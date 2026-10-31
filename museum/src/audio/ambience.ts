import { ATRIUM } from "../../../shared/museum/atrium";

/**
 * The museum's sound, made live with Web Audio (nothing to download): rushing water placed at the
 * water wall, and a faint low room tone everywhere. Off until the visitor turns it on.
 */
class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  /** Must run inside a click or key press, like everything that starts audio. */
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      this.fade(1);
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // Water: brown-ish noise, low-passed, with a brighter splash layer, coming from the water wall.
    const noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5 + white * 0.08;
    }
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 1400;
    const panner = new PannerNode(ctx, {
      panningModel: "HRTF", distanceModel: "inverse", refDistance: 3, rolloffFactor: 1.1,
      positionX: 0, positionY: 4, positionZ: ATRIUM.waterWall.z + 0.5,
    });
    const waterGain = ctx.createGain();
    waterGain.gain.value = 0.9;
    src.connect(low).connect(waterGain).connect(panner).connect(this.master);
    src.start();

    // Room tone: two soft low sines, slightly detuned, so the silence has a body.
    const tone = ctx.createGain();
    tone.gain.value = 0.025;
    for (const f of [55, 82.6]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      o.connect(tone);
      o.start();
    }
    tone.connect(this.master);
    this.fade(1);
  }

  stop() {
    this.fade(0);
  }

  private fade(to: number) {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(to, this.ctx.currentTime, 0.4);
  }

  /** Moves the listener with the camera. Forward is the view direction. */
  listen(x: number, y: number, z: number, yaw: number) {
    const l = this.ctx?.listener;
    if (!l || !l.positionX) return;
    const t = this.ctx!.currentTime;
    l.positionX.setTargetAtTime(x, t, 0.05);
    l.positionY.setTargetAtTime(y, t, 0.05);
    l.positionZ.setTargetAtTime(z, t, 0.05);
    l.forwardX.setTargetAtTime(-Math.sin(yaw), t, 0.05);
    l.forwardZ.setTargetAtTime(-Math.cos(yaw), t, 0.05);
    l.forwardY.value = 0;
    l.upY.value = 1;
  }
}

export const ambience = new Ambience();
