import { CanvasExperiment } from "./canvas-experiment.js";
import { clamp, random } from "./posters.js";

const TAU = Math.PI * 2;

// A velocity field carries every mark forward. Unlike the type experiment,
// these particles have no home position: the picture is their accumulated path.
export class VortexFlow extends CanvasExperiment {
  onInit() {
    this.rng = random(this.config.seed || 71);
    this.direction = 1;
    this.swirl = 1;
    this.pulse = 0;
    this.frameDt = 1 / 60;
    this.center = {
      x: this.width * 0.5,
      y: this.height * 0.55,
      vx: 0,
      vy: 0,
    };
    this.particles = [];
    const count = clamp(
      Math.round((this.width * this.height) / 820),
      480,
      1200,
    );
    for (let i = 0; i < count; i++) {
      const particle = {
        x: 0,
        y: 0,
        px: 0,
        py: 0,
        vx: 0,
        vy: 0,
        age: 0,
        life: 0,
        color: i % 4,
        weight: 0.55 + this.rng() * 1.05,
      };
      this.resetParticle(particle, true);
      this.particles.push(particle);
    }
    this.makeTrail();
    // The first frame already contains a field of flowing ink.
    for (let i = 0; i < 52; i++) {
      this.update(1 / 60, i / 60);
      this.paintTrails();
    }
  }

  makeTrail() {
    if (!this.trail) this.trail = document.createElement("canvas");
    this.trail.width = Math.round(this.width * this.dpr);
    this.trail.height = Math.round(this.height * this.dpr);
    this.trailCtx = this.trail.getContext("2d");
    this.trailCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  resetParticle(particle, initial = false) {
    const angle = this.rng() * TAU;
    const radius = Math.sqrt(this.rng());
    particle.x = this.width * (0.5 + Math.cos(angle) * radius * 0.46);
    particle.y = this.height * (0.55 + Math.sin(angle) * radius * 0.35);
    particle.px = particle.x;
    particle.py = particle.y;
    particle.vx = 0;
    particle.vy = 0;
    particle.life = 3.5 + this.rng() * 6;
    particle.age = initial ? this.rng() * particle.life : 0;
  }

  onPointerDown() {
    this.direction *= -1;
    this.pulse = 1;
  }

  update(dt, time) {
    if (!this.particles) return;
    const step = clamp(dt, 0.001, 1 / 30);
    const frame = step * 60;
    this.frameDt = step;
    const center = this.center;
    const targetX = this.pointer.active
      ? clamp(this.pointer.x, this.width * 0.18, this.width * 0.82)
      : this.width * (0.5 + Math.sin(time * 0.29) * 0.055);
    const targetY = this.pointer.active
      ? clamp(this.pointer.y, this.height * 0.25, this.height * 0.8)
      : this.height * (0.55 + Math.cos(time * 0.24) * 0.025);
    center.vx += (targetX - center.x) * 0.023 * frame;
    center.vy += (targetY - center.y) * 0.023 * frame;
    const springDamping = Math.pow(0.79, frame);
    center.vx *= springDamping;
    center.vy *= springDamping;
    center.x += center.vx * frame;
    center.y += center.vy * frame;
    this.swirl += (this.direction - this.swirl) * (1 - Math.pow(0.95, frame));
    this.pulse *= Math.pow(0.965, frame);

    const unit = Math.max(80, Math.min(this.width * 0.43, this.height * 0.34));
    const speed = clamp(unit * 0.43, 58, 145);
    const settle = 1 - Math.pow(0.88, frame);
    for (const particle of this.particles) {
      particle.age += step;
      particle.px = particle.x;
      particle.py = particle.y;
      if (
        particle.age > particle.life ||
        particle.x < -20 ||
        particle.x > this.width + 20 ||
        particle.y < this.height * 0.12 ||
        particle.y > this.height * 0.92
      ) {
        this.resetParticle(particle);
        continue;
      }

      const x = (particle.x - center.x) / unit;
      const y = (particle.y - center.y) / unit;
      const radius = Math.hypot(x, y);
      // Curl of a smooth stream function, with a coherent central vortex.
      const fieldX =
        (-y / (0.19 + radius)) * this.swirl +
        Math.cos(y * 2.8 + time * 0.17) *
          Math.cos(x * 2.1 - time * 0.13) *
          0.48;
      const fieldY =
        (x / (0.19 + radius)) * this.swirl +
        Math.sin(x * 2.1 - time * 0.13) *
          Math.sin(y * 2.8 + time * 0.17) *
          0.36;
      const pulse = this.pulse * Math.exp(-radius * 2.3) * 2.4;
      const length = Math.max(0.35, Math.hypot(fieldX, fieldY));
      const vx = (fieldX / length + x * pulse) * speed;
      const vy = (fieldY / length + y * pulse) * speed;
      particle.vx += (vx - particle.vx) * settle;
      particle.vy += (vy - particle.vy) * settle;
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
    }
  }

  paintTrails() {
    const ctx = this.trailCtx;
    if (!ctx || !this.particles) return;
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = `rgba(0,0,0,${1 - Math.exp(-this.frameDt * 0.55)})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "round";
    const palette = [
      this.config.ink || "#872d41",
      this.config.accent || "#bd4d66",
      "#f8ddce",
      "#a44058",
    ];
    for (let color = 0; color < palette.length; color++) {
      ctx.strokeStyle = palette[color];
      ctx.globalAlpha = color === 2 ? 0.78 : 0.62;
      ctx.lineWidth = color === 2 ? 0.85 : 1.05;
      ctx.beginPath();
      for (const particle of this.particles) {
        if (particle.color !== color || particle.age < 0.025) continue;
        ctx.moveTo(particle.px, particle.py);
        ctx.lineTo(particle.x, particle.y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  draw() {
    if (!this.trail) return;
    this.paintTrails();
    this.background(this.config.bg || "#efa7bd");
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(
      this.width * 0.5,
      this.height * 0.55,
      this.width * 0.46,
      this.height * 0.35,
      0,
      0,
      TAU,
    );
    ctx.clip();
    ctx.drawImage(this.trail, 0, 0, this.width, this.height);
    ctx.restore();
    // A quiet registration mark makes the moving vortex center legible.
    ctx.strokeStyle = this.config.ink || "#872d41";
    ctx.globalAlpha = 0.38;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(this.center.x, this.center.y, 7 + this.pulse * 27, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  resize() {
    const oldW = this.width;
    const oldH = this.height;
    super.resize();
    if (!this.particles || !oldW || !oldH) return;
    const scaleX = this.width / oldW;
    const scaleY = this.height / oldH;
    for (const particle of this.particles) {
      particle.x *= scaleX;
      particle.px = particle.x;
      particle.y *= scaleY;
      particle.py = particle.y;
      particle.vx *= scaleX;
      particle.vy *= scaleY;
    }
    this.center.x *= scaleX;
    this.center.y *= scaleY;
    this.center.vx = 0;
    this.center.vy = 0;
    this.makeTrail();
  }

  destroy() {
    super.destroy();
    if (this.particles) this.particles.length = 0;
    if (this.trail) this.trail.width = this.trail.height = 0;
    this.trail = null;
    this.trailCtx = null;
  }
}

// Two almost identical gratings produce much larger interference bands.
// Sliding one optical plate changes those bands; no pixels are erased/revealed.
export class MoireLens extends CanvasExperiment {
  onInit() {
    this.mode = 0;
    this.layer = { x: 0, y: 0, angle: 0.045, vx: 0, vy: 0, va: 0 };
    this.makePlate();
  }

  geometry() {
    this.radius = Math.max(
      52,
      Math.min(this.width * 0.405, this.height * 0.335),
    );
    this.centerX = this.width * 0.5;
    this.centerY = this.height * 0.54;
    this.pitch = clamp(this.radius / 51, 3.7, 6.1);
  }

  drawGrating(ctx, extent, pitch, rings = false) {
    ctx.beginPath();
    if (rings) {
      for (let radius = pitch; radius < extent * 1.65; radius += pitch) {
        ctx.moveTo(radius, 0);
        ctx.arc(0, 0, radius, 0, TAU);
      }
    } else {
      for (let x = -extent * 1.6; x <= extent * 1.6; x += pitch) {
        ctx.moveTo(x, -extent * 1.6);
        ctx.lineTo(x, extent * 1.6);
      }
    }
    ctx.stroke();
  }

  makePlate() {
    this.geometry();
    if (!this.plate) this.plate = document.createElement("canvas");
    const size = Math.ceil(this.radius * 2 + 6);
    this.plate.width = Math.round(size * this.dpr);
    this.plate.height = Math.round(size * this.dpr);
    const ctx = this.plate.getContext("2d");
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-0.22);
    ctx.strokeStyle = this.config.ink || "#513885";
    ctx.lineWidth = this.pitch * 0.46;
    this.drawGrating(ctx, this.radius + 4, this.pitch, this.mode === 1);
    this.plateSize = size;
  }

  onPointerDown() {
    this.mode = (this.mode + 1) % 2;
    this.makePlate();
    this.layer.vx += this.radius * 0.025;
    this.layer.va += 0.012;
  }

  update(dt, time) {
    if (!this.layer) return;
    const frame = clamp(dt, 0.001, 1 / 30) * 60;
    const active = this.pointer.active;
    const x = active
      ? clamp((this.pointer.x - this.centerX) / this.radius, -1, 1)
      : Math.sin(time * 0.31) * 0.63;
    const y = active
      ? clamp((this.pointer.y - this.centerY) / this.radius, -1, 1)
      : Math.cos(time * 0.23) * 0.42;
    const targetX = x * this.radius * 0.19;
    const targetY = y * this.radius * 0.19;
    const targetAngle = 0.052 + x * 0.085 + Math.sin(time * 0.21) * 0.014;
    const layer = this.layer;
    layer.vx += (targetX - layer.x) * 0.031 * frame;
    layer.vy += (targetY - layer.y) * 0.031 * frame;
    layer.va += (targetAngle - layer.angle) * 0.031 * frame;
    const damping = Math.pow(0.8, frame);
    layer.vx *= damping;
    layer.vy *= damping;
    layer.va *= damping;
    layer.x += layer.vx * frame;
    layer.y += layer.vy * frame;
    layer.angle += layer.va * frame;
  }

  draw() {
    if (!this.plate || !this.layer) return;
    const ctx = this.ctx;
    this.background(this.config.bg || "#efc34f");
    const ink = this.config.ink || "#513885";
    const accent = this.config.accent || "#e86c45";
    const radius = this.radius;
    ctx.save();
    ctx.translate(this.centerX, this.centerY);

    // The fine concentric frame stays fixed as the inner plates drift.
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.75;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 11, 0, TAU);
    ctx.arc(0, 0, radius + 16, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.clip();
    ctx.fillStyle = "#f7d96e";
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.drawImage(
      this.plate,
      -this.plateSize / 2,
      -this.plateSize / 2,
      this.plateSize,
      this.plateSize,
    );

    ctx.save();
    ctx.translate(this.layer.x, this.layer.y);
    ctx.rotate(-0.22 + this.layer.angle);
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.84;
    ctx.lineWidth = this.pitch * 0.43;
    this.drawGrating(ctx, radius * 1.22, this.pitch * 1.012, this.mode === 1);
    ctx.restore();

    // An offset vermilion disc acts as a bright optical registration point.
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(
      this.layer.x * 0.55,
      this.layer.y * 0.55,
      Math.max(7, radius * 0.038),
      0,
      TAU,
    );
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = ink;
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI * 0.5;
      ctx.beginPath();
      ctx.arc(
        this.centerX + Math.cos(angle) * (radius + 16),
        this.centerY + Math.sin(angle) * (radius + 16),
        2.4,
        0,
        TAU,
      );
      ctx.fill();
    }
  }

  resize() {
    const oldRadius = this.radius;
    super.resize();
    this.geometry();
    if (!this.layer) return;
    const scale = oldRadius ? this.radius / oldRadius : 1;
    this.layer.x *= scale;
    this.layer.y *= scale;
    this.layer.vx = 0;
    this.layer.vy = 0;
    this.makePlate();
  }

  destroy() {
    super.destroy();
    if (this.plate) this.plate.width = this.plate.height = 0;
    this.plate = null;
    this.layer = null;
  }
}
