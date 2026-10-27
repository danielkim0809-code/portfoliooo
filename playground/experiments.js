import { clamp, lerp, random } from "./posters.js";
import { CanvasExperiment } from "./canvas-experiment.js";
import { ClothWeave, ElasticRibbons } from "./material-experiments.js";
import { VortexFlow, MoireLens } from "./field-experiments.js";
export { CanvasExperiment } from "./canvas-experiment.js";
const TAU = Math.PI * 2;

export class FractalTrees extends CanvasExperiment {
  onInit() {
    this.trees = [];
    this.serial = 0;
    this.lastPlant = null;
    this.addTree(this.width * 0.31, this.height * 0.88, 1.1);
    this.addTree(this.width * 0.7, this.height * 0.89, 0.8);
  }
  addTree(x, y, size = 1) {
    const rng = random(this.config.seed + this.serial++ * 137),
      nodes = [];
    const depth = this.width < 600 ? 7 : 8;
    const initial =
      Math.min(this.height * 0.22, this.width * 0.22) *
      (size * (0.82 + rng() * 0.24));
    const branch = (parent, level, length, offset) => {
      const node = {
        parent,
        level,
        length,
        offset,
        bend: 0,
        bendVelocity: 0,
        x,
        y,
        angle: -Math.PI / 2,
        phase: rng() * TAU,
      };
      const index = nodes.push(node) - 1;
      if (level < depth) {
        const spread = (this.config.night ? 0.36 : 0.43) + rng() * 0.14;
        branch(index, level + 1, length * (0.68 + rng() * 0.08), -spread);
        branch(index, level + 1, length * (0.68 + rng() * 0.08), spread);
      }
    };
    branch(-1, 0, initial, 0);
    this.trees.push({ x, y, nodes, age: 0, depth, seed: rng() });
    if (this.trees.length > 12) this.trees.shift();
    this.lastPlant = { x, y };
  }
  onPointerDown() {
    this.addTree(this.pointer.x, this.pointer.y, 0.65 + Math.random() * 0.35);
  }
  onPointerMove() {
    if (
      this.pointer.down &&
      (!this.lastPlant ||
        Math.hypot(
          this.pointer.x - this.lastPlant.x,
          this.pointer.y - this.lastPlant.y,
        ) > 66)
    )
      this.addTree(this.pointer.x, this.pointer.y, 0.65);
  }
  update(dt, time) {
    const frame = dt * 60;
    const wind = this.pointer.active
      ? clamp(this.pointer.vx * 0.005, -0.3, 0.3)
      : 0;
    for (const tree of this.trees) {
      tree.age += dt;
      for (const node of tree.nodes) {
        const factor = (node.level / tree.depth) ** 2;
        const target =
          (wind + Math.sin(time * 1.7 + node.phase) * 0.032) * factor;
        node.bendVelocity += (target - node.bend) * 0.1 * frame;
        node.bendVelocity *= Math.pow(0.84, frame);
        node.bend += node.bendVelocity * frame;
        const parent = node.parent < 0 ? null : tree.nodes[node.parent];
        node.sx = parent ? parent.x : tree.x;
        node.sy = parent ? parent.y : tree.y;
        node.angle =
          (parent ? parent.angle : -Math.PI / 2) + node.offset + node.bend;
        const growth = clamp((tree.age - node.level * 0.1) * 2.4, 0, 1);
        node.growth = growth;
        node.x = node.sx + Math.cos(node.angle) * node.length * growth;
        node.y = node.sy + Math.sin(node.angle) * node.length * growth;
      }
    }
  }
  draw() {
    if (!this.trees) return;
    const ctx = this.ctx;
    this.background();
    ctx.fillStyle = this.config.accent;
    ctx.globalAlpha = 0.1;
    ctx.beginPath();
    ctx.ellipse(
      this.width * 0.5,
      this.height * 0.9,
      this.width * 0.65,
      this.height * 0.1,
      0,
      0,
      TAU,
    );
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineCap = "round";
    for (const tree of this.trees) {
      ctx.strokeStyle = this.config.ink;
      ctx.fillStyle = this.config.ink;
      for (const node of tree.nodes) {
        if (!node.growth) continue;
        ctx.lineWidth = Math.max(0.65, (tree.depth - node.level) * 0.67);
        ctx.beginPath();
        ctx.moveTo(node.sx, node.sy);
        ctx.lineTo(node.x, node.y);
        ctx.stroke();
        if (node.level === tree.depth && node.growth > 0.5) {
          ctx.globalAlpha = node.growth * 0.9;
          ctx.beginPath();
          ctx.ellipse(node.x, node.y, 2.5, 4.4, node.angle, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }
  }
  resize() {
    const oldW = this.width,
      oldH = this.height;
    super.resize();
    if (this.trees && oldW && oldH)
      for (const tree of this.trees) {
        tree.x *= this.width / oldW;
        tree.y *= this.height / oldH;
        const ratio = Math.min(this.width / oldW, this.height / oldH);
        for (const node of tree.nodes) node.length *= ratio;
      }
  }
  destroy() {
    super.destroy();
    this.trees.length = 0;
  }
}

export class RollingHills extends CanvasExperiment {
  onInit() {
    this.objects = [];
    this.serial = 0;
    this.drop(this.width * 0.29, this.height * 0.25);
    this.drop(this.width * 0.57, this.height * 0.17);
    this.drop(this.width * 0.74, this.height * 0.3);
  }
  surface(x, time, layer = 2) {
    const f = TAU / Math.max(480, this.width * 1.05),
      amp = this.height * (0.044 + layer * 0.006);
    return (
      this.height * (0.46 + layer * 0.115) +
      Math.sin(x * f + time * (0.32 + layer * 0.05) + layer * 1.7) * amp +
      Math.sin(x * f * 1.8 - time * 0.27 + layer) * amp * 0.42
    );
  }
  slope(x, time, layer = 2) {
    const f = TAU / Math.max(480, this.width * 1.05),
      amp = this.height * (0.044 + layer * 0.006);
    return (
      Math.cos(x * f + time * (0.32 + layer * 0.05) + layer * 1.7) * amp * f +
      Math.cos(x * f * 1.8 - time * 0.27 + layer) * amp * 0.42 * f * 1.8
    );
  }
  drop(x, y) {
    const rng = random(this.config.seed + this.serial++ * 79),
      radius = 20 + rng() * 22;
    this.objects.push({
      x,
      y: Math.min(y, this.surface(x, this.time) - radius - 10),
      vx: (rng() - 0.5) * 110,
      vy: 0,
      r: radius,
      rotation: rng() * TAU,
      grounded: false,
      bounces: 0,
      color: this.serial % 2 ? this.config.ink : this.config.accent,
      square: this.config.seed === 67 && this.serial % 3 === 0,
    });
    if (this.objects.length > 26) this.objects.shift();
  }
  onPointerDown() {
    this.drop(this.pointer.x, this.pointer.y);
    this.lastDrop = this.pointer.x;
  }
  onPointerMove() {
    if (this.pointer.down && Math.abs(this.pointer.x - this.lastDrop) > 85) {
      this.drop(this.pointer.x, this.pointer.y);
      this.lastDrop = this.pointer.x;
    }
  }
  update(dt, time) {
    for (const body of this.objects) {
      const slope = this.slope(body.x, time),
        angle = Math.atan(slope);
      if (body.grounded) {
        body.vx += ((1300 * slope) / (1 + slope * slope)) * 0.72 * dt;
        body.vx *= Math.pow(0.996, dt * 60);
        body.x += body.vx * dt;
        body.y = this.surface(body.x, time) - body.r / Math.cos(angle);
        body.rotation += (body.vx / body.r) * dt;
      } else {
        body.vy += 1300 * dt;
        body.x += body.vx * dt;
        body.y += body.vy * dt;
        const ground = this.surface(body.x, time) - body.r;
        if (body.y >= ground) {
          body.y = ground;
          if (body.vy > 180 && body.bounces < 2) {
            body.vy *= -0.34;
            body.bounces++;
          } else {
            body.grounded = true;
            body.vy = 0;
          }
        }
        body.rotation += (body.vx / body.r) * dt * 0.6;
      }
      if (body.x < -body.r * 2) body.x = this.width + body.r;
      if (body.x > this.width + body.r * 2) body.x = -body.r;
    }
  }
  draw() {
    if (!this.objects) return;
    const ctx = this.ctx;
    this.background();
    ctx.fillStyle = this.config.accent;
    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    ctx.arc(
      this.width * 0.78,
      this.height * 0.27,
      Math.min(this.width, this.height) * 0.12,
      0,
      TAU,
    );
    ctx.fill();
    ctx.globalAlpha = 1;
    const colors = [this.config.accent, this.config.ink, this.config.accent];
    for (let layer = 0; layer < 3; layer++) {
      ctx.fillStyle = colors[layer];
      ctx.globalAlpha = layer === 0 ? 0.25 : layer === 1 ? 0.45 : 1;
      ctx.beginPath();
      ctx.moveTo(-5, this.height);
      for (let x = -5; x <= this.width + 8; x += 7)
        ctx.lineTo(x, this.surface(x, this.time, layer));
      ctx.lineTo(this.width + 8, this.height);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const body of this.objects) {
      ctx.save();
      ctx.translate(body.x, body.y);
      ctx.rotate(
        body.rotation +
          (body.grounded ? Math.atan(this.slope(body.x, this.time)) : 0),
      );
      ctx.fillStyle = body.color;
      ctx.strokeStyle = this.config.bg;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (body.square)
        ctx.roundRect(
          -body.r * 0.84,
          -body.r * 0.84,
          body.r * 1.68,
          body.r * 1.68,
          5,
        );
      else ctx.arc(0, 0, body.r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, body.r * 0.66, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = this.config.bg;
      ctx.beginPath();
      ctx.arc(body.r * 0.47, -body.r * 0.36, body.r * 0.1, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
  resize() {
    const oldW = this.width,
      oldH = this.height;
    super.resize();
    if (this.objects && oldW)
      for (const body of this.objects) {
        body.x *= this.width / oldW;
        body.y *= this.height / oldH;
        body.grounded = false;
      }
  }
  destroy() {
    super.destroy();
    this.objects.length = 0;
  }
}

export class ParticleTypography extends CanvasExperiment {
  onInit() {
    this.ripple = 0;
  }
  resize() {
    super.resize();
    this.particles = [];
    const sample = document.createElement("canvas");
    sample.width = this.width;
    sample.height = this.height;
    const ctx = sample.getContext("2d", { willReadFrequently: true });
    const lines = this.config.word.split("\n");
    let fontSize = Math.min(
      this.height * (lines.length > 1 ? 0.245 : 0.36),
      this.width / (Math.max(...lines.map((line) => line.length)) * 0.68),
    );
    fontSize = Math.max(32, fontSize);
    ctx.font = `900 ${fontSize}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    lines.forEach((line, index) =>
      ctx.fillText(
        line,
        this.width / 2,
        this.height * 0.49 + (index - (lines.length - 1) / 2) * fontSize * 0.95,
      ),
    );
    const image = ctx.getImageData(0, 0, sample.width, sample.height).data,
      step = clamp(
        Math.floor(Math.sqrt((this.width * this.height) / 40000)),
        3,
        7,
      ),
      rng = random(this.config.seed);
    for (let y = 0; y < this.height; y += step)
      for (let x = 0; x < this.width; x += step)
        if (image[(y * sample.width + x) * 4 + 3] > 100)
          this.particles.push({
            x: x + (rng() - 0.5) * 18,
            y: y + (rng() - 0.5) * 18,
            homeX: x,
            homeY: y,
            vx: 0,
            vy: 0,
            r: step * (0.22 + rng() * 0.13),
            color: rng() > 0.18 ? 0 : 1,
          });
    this.radius = Math.min(150, this.width * 0.28);
    sample.width = 1;
    sample.height = 1;
  }
  onPointerDown() {
    this.ripple = 1;
  }
  update(dt) {
    const frame = dt * 60,
      p = this.pointer,
      radius = this.radius * (p.down ? 1.35 : 1);
    this.ripple = Math.max(0, this.ripple - dt * 1.8);
    for (const dot of this.particles) {
      dot.vx += (dot.homeX - dot.x) * 0.024 * frame;
      dot.vy += (dot.homeY - dot.y) * 0.024 * frame;
      if (p.active) {
        const dx = dot.x - p.x,
          dy = dot.y - p.y,
          d2 = dx * dx + dy * dy;
        if (d2 < radius * radius) {
          const distance = Math.max(0.5, Math.sqrt(d2)),
            force = (1 - distance / radius) * (p.down ? 15 : 9);
          dot.vx += (dx / distance) * force * frame;
          dot.vy += (dy / distance) * force * frame;
        }
      }
      dot.vx *= Math.pow(0.85, frame);
      dot.vy *= Math.pow(0.85, frame);
      dot.x += dot.vx * frame;
      dot.y += dot.vy * frame;
    }
  }
  draw() {
    if (!this.particles) return;
    const ctx = this.ctx;
    this.background();
    for (let group = 0; group < 2; group++) {
      ctx.fillStyle = group ? this.config.accent : this.config.ink;
      ctx.beginPath();
      for (const dot of this.particles)
        if (dot.color === group) {
          ctx.moveTo(dot.x + dot.r, dot.y);
          ctx.arc(dot.x, dot.y, dot.r, 0, TAU);
        }
      ctx.fill();
    }
    if (this.ripple > 0) {
      ctx.strokeStyle = this.config.ink;
      ctx.globalAlpha = this.ripple * 0.3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(
        this.pointer.x,
        this.pointer.y,
        this.radius * (1.2 - this.ripple * 0.8),
        0,
        TAU,
      );
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  destroy() {
    super.destroy();
    this.particles.length = 0;
  }
}

export class WiperReveal extends CanvasExperiment {
  onInit() {
    this.angle = -0.9;
    this.angularVelocity = 0;
    this.previousAngle = this.angle;
    this.manual = null;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  resize() {
    super.resize();
    this.art = document.createElement("canvas");
    this.mask = document.createElement("canvas");
    for (const canvas of [this.art, this.mask]) {
      canvas.width = this.canvas.width;
      canvas.height = this.canvas.height;
      canvas.getContext("2d").setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    this.maskCtx = this.mask.getContext("2d");
    this.drawArt();
    this.makeFog();
    this.pivot = { x: this.width * 0.5, y: this.height + 35 };
    this.length = Math.hypot(this.width * 0.62, this.height * 0.9);
    this.manual = null;
  }
  drawArt() {
    const ctx = this.art.getContext("2d"),
      palette = this.config.art,
      rng = random(this.config.seed),
      size = Math.max(this.width / 4, this.height / 3);
    ctx.fillStyle = palette[0];
    ctx.fillRect(0, 0, this.width, this.height);
    for (let row = 0; row < Math.ceil(this.height / size); row++)
      for (let col = 0; col < Math.ceil(this.width / size); col++) {
        ctx.save();
        ctx.translate((col + 0.5) * size, (row + 0.5) * size);
        ctx.rotate((Math.floor(rng() * 4) * Math.PI) / 2);
        ctx.fillStyle = palette[(row + col) % 4];
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.fillStyle = palette[(row + col + 1) % 4];
        const kind = (row * 3 + col) % 4;
        if (kind === 0) {
          ctx.beginPath();
          ctx.arc(-size / 2, -size / 2, size, 0, Math.PI / 2);
          ctx.lineTo(-size / 2, -size / 2);
          ctx.fill();
        } else if (kind === 1) {
          for (let i = 0; i < 7; i++) {
            ctx.beginPath();
            ctx.arc(0, 0, size * (0.08 + i * 0.075), 0, TAU);
            ctx.strokeStyle =
              i % 2
                ? palette[(row + col + 2) % 4]
                : palette[(row + col + 1) % 4];
            ctx.lineWidth = size * 0.055;
            ctx.stroke();
          }
        } else if (kind === 2) {
          ctx.beginPath();
          for (let i = 0; i < 16; i++) {
            const r = i % 2 ? size * 0.22 : size * 0.48,
              a = (i * Math.PI) / 8;
            const x = Math.cos(a) * r,
              y = Math.sin(a) * r;
            if (!i) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
        } else {
          for (let i = -4; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(-size / 2, i * size * 0.2);
            ctx.lineTo(size / 2, i * size * 0.2 + size / 2);
            ctx.lineWidth = size * 0.1;
            ctx.strokeStyle = palette[(row + col + 1) % 4];
            ctx.stroke();
          }
        }
        ctx.restore();
      }
  }
  makeFog() {
    const ctx = this.maskCtx,
      rng = random(this.config.seed * 11);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = this.config.bg;
    ctx.fillRect(0, 0, this.width, this.height);
    const count = Math.min(800, (this.width * this.height) / 1400);
    for (let i = 0; i < count; i++) {
      const x = rng() * this.width,
        y = rng() * this.height,
        r = 1 + rng() * 4;
      ctx.strokeStyle = "rgba(255,255,255,.22)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(x, y, r, Math.PI, TAU);
      ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,.08)";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI);
      ctx.stroke();
    }
  }
  tip(angle, radius = this.length) {
    return {
      x: this.pivot.x + Math.sin(angle) * radius,
      y: this.pivot.y - Math.cos(angle) * radius,
    };
  }
  onPointerDown() {
    this.manual = { x: this.pointer.x, y: this.pointer.y };
    this.eraseTrail(this.manual, this.manual);
  }
  onPointerMove() {
    if (this.pointer.down) {
      const next = { x: this.pointer.x, y: this.pointer.y };
      this.eraseTrail(this.manual || next, next);
      this.manual = next;
    }
  }
  onPointerUp() {
    this.manual = null;
  }
  eraseTrail(a, b) {
    const ctx = this.maskCtx;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = Math.min(115, this.width * 0.22);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x + 0.01, b.y + 0.01);
    ctx.stroke();
    ctx.restore();
  }
  update(dt, time) {
    const target = this.pointer.active
      ? clamp(
          Math.atan2(
            this.pointer.x - this.pivot.x,
            this.pivot.y - this.pointer.y,
          ),
          -1.1,
          1.1,
        )
      : this.reduced
        ? this.angle
        : Math.sin(time * 0.62) * 1.02;
    const frame = dt * 60;
    this.angularVelocity += (target - this.angle) * 0.048 * frame;
    this.angularVelocity *= Math.pow(0.78, frame);
    this.previousAngle = this.angle;
    this.angle += this.angularVelocity * frame;
    const ctx = this.maskCtx;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.0025 * frame;
    ctx.fillStyle = this.config.bg;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalAlpha = 1;
    if (Math.abs(this.angle - this.previousAngle) > 0.00001) {
      const oldBase = this.tip(this.previousAngle, this.length * 0.08),
        oldTip = this.tip(this.previousAngle),
        newTip = this.tip(this.angle),
        newBase = this.tip(this.angle, this.length * 0.08);
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.moveTo(oldBase.x, oldBase.y);
      ctx.lineTo(oldTip.x, oldTip.y);
      ctx.lineTo(newTip.x, newTip.y);
      ctx.lineTo(newBase.x, newBase.y);
      ctx.closePath();
      ctx.fill();
      ctx.lineCap = "round";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 28;
      ctx.beginPath();
      ctx.moveTo(newBase.x, newBase.y);
      ctx.lineTo(newTip.x, newTip.y);
      ctx.stroke();
    }
    ctx.restore();
  }
  draw() {
    if (!this.art) return;
    const ctx = this.ctx;
    ctx.drawImage(this.art, 0, 0, this.width, this.height);
    ctx.drawImage(this.mask, 0, 0, this.width, this.height);
    if (!this.pivot || this.angle === undefined) return;
    const end = this.tip(this.angle),
      base = this.tip(this.angle, this.length * 0.1);
    ctx.lineCap = "round";
    ctx.strokeStyle = this.config.ink;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(this.pivot.x, this.pivot.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.config.bg;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.fillStyle = this.config.ink;
    ctx.beginPath();
    ctx.arc(this.pivot.x, this.pivot.y, 22, 0, TAU);
    ctx.fill();
  }
  destroy() {
    super.destroy();
    for (const canvas of [this.art, this.mask]) {
      canvas.width = 1;
      canvas.height = 1;
    }
    this.art = null;
    this.mask = null;
    this.maskCtx = null;
  }
}

export const EXPERIMENTS = {
  trees: FractalTrees,
  hills: RollingHills,
  type: ParticleTypography,
  wiper: WiperReveal,
  cloth: ClothWeave,
  ribbons: ElasticRibbons,
  vortex: VortexFlow,
  moire: MoireLens,
};
