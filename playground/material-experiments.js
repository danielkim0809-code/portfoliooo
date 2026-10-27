import { CanvasExperiment } from "./canvas-experiment.js";
import { clamp, random } from "./posters.js";

const TAU = Math.PI * 2;

// A woven surface: point masses, top pins, structural links and soft shear links.
export class ClothWeave extends CanvasExperiment {
  onInit() {
    this.nodes = [];
    this.links = [];
    this.grabbed = -1;
    this.makeCloth();
  }

  makeCloth() {
    const compact = this.width < 600;
    this.columns = compact ? 18 : 28;
    this.rows = compact ? 24 : 22;
    const availableHeight = Math.max(100, this.height - 220);
    this.fabricWidth = Math.min(this.width * (compact ? 0.82 : 0.62), 760);
    this.fabricHeight = Math.min(
      availableHeight,
      this.fabricWidth * (compact ? 1.24 : 0.72),
    );
    this.originX = (this.width - this.fabricWidth) / 2;
    this.originY = Math.max(105, (this.height - this.fabricHeight) / 2 - 16);
    this.stepX = this.fabricWidth / this.columns;
    this.stepY = this.fabricHeight / this.rows;
    const rng = random(this.config.seed || 71);
    this.nodes.length = 0;
    this.links.length = 0;
    for (let row = 0; row <= this.rows; row++) {
      for (let column = 0; column <= this.columns; column++) {
        const x = this.originX + column * this.stepX;
        const y = this.originY + row * this.stepY;
        const pinned = row === 0;
        this.nodes.push({
          x,
          y,
          px: x - Math.sin(column * 0.42) * row * 0.055,
          py: y,
          anchorX: x,
          anchorY: y,
          row,
          column,
          pinned,
          phase: rng() * TAU,
        });
        const index = row * (this.columns + 1) + column;
        if (column > 0) this.addLink(index - 1, index, this.stepX, 1);
        if (row > 0)
          this.addLink(index - this.columns - 1, index, this.stepY, 1);
        if (row > 0 && column > 0) {
          const diagonal = Math.hypot(this.stepX, this.stepY);
          this.addLink(index - this.columns - 2, index, diagonal, 0.3);
          this.addLink(index - this.columns - 1, index - 1, diagonal, 0.3);
        }
      }
    }
    this.grabbed = -1;
  }

  addLink(a, b, length, stiffness) {
    this.links.push({ a, b, length, stiffness });
  }

  onPointerDown() {
    let nearest = -1;
    let distance = Math.max(60, this.stepX * 2.5);
    for (let index = 0; index < this.nodes.length; index++) {
      const node = this.nodes[index];
      if (node.pinned) continue;
      const next = Math.hypot(node.x - this.pointer.x, node.y - this.pointer.y);
      if (next < distance) {
        nearest = index;
        distance = next;
      }
    }
    this.grabbed = nearest;
  }

  onPointerUp() {
    this.grabbed = -1;
  }

  update(dt, time) {
    if (!this.nodes?.length) return;
    // Small substeps keep the Verlet constraints steady on slow mobile frames.
    const steps = clamp(Math.ceil(dt * 120), 1, 4);
    const h = Math.min(dt, 1 / 30) / steps;
    const damping = Math.pow(0.986, h * 60);
    for (let step = 0; step < steps; step++) {
      for (const node of this.nodes) {
        if (node.pinned) continue;
        const vx = clamp((node.x - node.px) * damping, -18, 18);
        const vy = clamp((node.y - node.py) * damping, -18, 18);
        node.px = node.x;
        node.py = node.y;
        const depth = node.row / this.rows;
        let wind =
          (Math.sin(time * 1.25 + depth * 3.1) * 80 +
            Math.sin(time * 2.05 + node.phase * 0.22) * 22) *
          depth;
        if (this.pointer.active && !this.pointer.down) {
          const proximity = Math.max(
            0,
            1 -
              Math.hypot(node.x - this.pointer.x, node.y - this.pointer.y) /
                170,
          );
          wind += clamp(this.pointer.vx, -50, 50) * proximity * 80;
        }
        node.x += vx + wind * h * h;
        node.y += vy + 580 * h * h;
      }
      for (let iteration = 0; iteration < 7; iteration++) {
        for (const link of this.links) {
          const a = this.nodes[link.a];
          const b = this.nodes[link.b];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distance = Math.hypot(dx, dy) || 0.0001;
          const correction =
            ((distance - link.length) / distance) * link.stiffness;
          const weight = a.pinned || b.pinned ? 1 : 0.5;
          if (!a.pinned) {
            a.x += dx * correction * weight;
            a.y += dy * correction * weight;
          }
          if (!b.pinned) {
            b.x -= dx * correction * weight;
            b.y -= dy * correction * weight;
          }
        }
        for (const node of this.nodes) {
          if (!node.pinned) continue;
          node.x = node.px = node.anchorX;
          node.y = node.py = node.anchorY;
        }
        const grabbed = this.nodes[this.grabbed];
        if (grabbed && this.pointer.down) {
          const gx = clamp(this.pointer.x, 10, this.width - 10);
          const gy = clamp(this.pointer.y, 95, this.height - 70);
          grabbed.x += (gx - grabbed.x) * 0.35;
          grabbed.y += (gy - grabbed.y) * 0.35;
          grabbed.px = grabbed.x;
          grabbed.py = grabbed.y;
        }
      }
    }
  }

  draw() {
    if (!this.nodes?.length) return;
    const ctx = this.ctx;
    const { columns, rows } = this;
    this.background(this.config.bg || "#352832");
    const gold = this.config.ink || "#efb36e";
    const rose = this.config.accent || "#ad6c59";
    const colors = [gold, gold, rose, "#edcfaa", gold, rose, rose, gold];

    ctx.strokeStyle = gold;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.max(22, this.originX - 36), this.originY - 16);
    ctx.lineTo(
      Math.min(this.width - 22, this.originX + this.fabricWidth + 36),
      this.originY - 16,
    );
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Each quad is real cloth geometry, so the weave folds with the mesh.
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const index = row * (columns + 1) + column;
        const a = this.nodes[index];
        const b = this.nodes[index + 1];
        const c = this.nodes[index + columns + 2];
        const d = this.nodes[index + columns + 1];
        const band = Math.floor((column / columns) * 8);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(d.x, d.y);
        ctx.closePath();
        ctx.fillStyle = colors[band];
        ctx.fill();
        const compression = Math.hypot(b.x - a.x, b.y - a.y) / this.stepX;
        const tilt = (b.y - a.y) / this.stepX;
        ctx.fillStyle = this.config.bg || "#352832";
        ctx.globalAlpha = clamp(
          0.04 +
            (1 - compression) * 0.42 +
            Math.abs(tilt) * 0.11 +
            (row % 2) * 0.025,
          0.02,
          0.46,
        );
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    ctx.lineWidth = 0.65;
    ctx.strokeStyle = this.config.bg || "#352832";
    ctx.globalAlpha = 0.28;
    for (let column = 0; column <= columns; column++) {
      ctx.beginPath();
      for (let row = 0; row <= rows; row++) {
        const node = this.nodes[row * (columns + 1) + column];
        if (row === 0) ctx.moveTo(node.x, node.y);
        else ctx.lineTo(node.x, node.y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = "#fff4dc";
    for (let row = 0; row <= rows; row++) {
      ctx.beginPath();
      for (let column = 0; column <= columns; column++) {
        const node = this.nodes[row * (columns + 1) + column];
        if (column === 0) ctx.moveTo(node.x, node.y);
        else ctx.lineTo(node.x, node.y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Small hangers and fine loose threads make the pinned edge legible.
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1.1;
    for (let column = 0; column <= columns; column += 2) {
      const top = this.nodes[column];
      const bottom = this.nodes[rows * (columns + 1) + column];
      ctx.beginPath();
      ctx.moveTo(top.x, top.y - 16);
      ctx.lineTo(top.x, top.y + 1);
      ctx.moveTo(bottom.x, bottom.y);
      ctx.lineTo(bottom.x + Math.sin(column) * 2, bottom.y + 9);
      ctx.stroke();
    }
    if (this.grabbed >= 0 && this.pointer.down) {
      const node = this.nodes[this.grabbed];
      ctx.strokeStyle = "#fff4dc";
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(node.x, node.y, 13, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  resize() {
    super.resize();
    if (this.nodes) this.makeCloth();
  }

  destroy() {
    super.destroy();
    this.nodes.length = 0;
    this.links.length = 0;
    this.grabbed = -1;
  }
}

// Independent connected spring chains, drawn as smooth bands of elastic ink.
export class ElasticRibbons extends CanvasExperiment {
  onInit() {
    this.ribbons = [];
    this.paletteIndex = 0;
    this.twist = 1;
    this.burst = 0;
    this.palettes = [
      [
        this.config.ink || "#363d8a",
        this.config.accent || "#ed7249",
        "#f4e5b8",
      ],
      ["#603e77", "#f59f90", "#f1d661"],
      ["#234e65", "#b9d8cf", "#e9764e"],
    ];
    this.makeRibbons();
  }

  makeRibbons() {
    this.ribbons.length = 0;
    const compact = this.width < 600;
    const count = compact ? 6 : 8;
    const segments = compact ? 34 : 44;
    this.linkLength = clamp(Math.min(this.width, this.height) * 0.023, 7, 17);
    this.bandWidth = clamp(Math.min(this.width, this.height) * 0.045, 12, 32);
    const rng = random(this.config.seed || 83);
    for (let index = 0; index < count; index++) {
      const phase = (index / count) * TAU;
      const nodes = [];
      for (let segment = 0; segment < segments; segment++) {
        const angle = phase + segment * 0.105;
        const radius =
          Math.min(this.width * 0.31, this.height * 0.24) + segment * 0.5;
        nodes.push({
          x: this.width * 0.5 + Math.cos(angle) * radius,
          y: this.height * 0.52 + Math.sin(angle) * radius * 0.75,
          vx: 0,
          vy: 0,
        });
      }
      this.ribbons.push({
        nodes,
        phase,
        width: this.bandWidth * (0.72 + rng() * 0.44),
        color: index % 3,
      });
    }
  }

  onPointerDown() {
    this.paletteIndex = (this.paletteIndex + 1) % this.palettes.length;
    this.twist *= -1;
    this.burst = 1;
    for (const ribbon of this.ribbons) {
      for (let index = 0; index < ribbon.nodes.length; index++) {
        const node = ribbon.nodes[index];
        const angle = ribbon.phase + index * 0.12;
        node.vx += Math.cos(angle) * 3.5;
        node.vy += Math.sin(angle) * 3.5;
      }
    }
  }

  update(dt, time) {
    if (!this.ribbons?.length) return;
    const steps = clamp(Math.ceil(dt * 120), 1, 4);
    const frame = (Math.min(dt, 1 / 30) * 60) / steps;
    const damping = Math.pow(0.83, frame);
    this.burst *= Math.pow(0.955, dt * 60);
    const marginTop = Math.min(120, this.height * 0.22);
    const marginBottom = Math.min(105, this.height * 0.2);
    const centerX = this.pointer.active
      ? clamp(this.pointer.x, this.width * 0.12, this.width * 0.88)
      : this.width * (0.5 + Math.sin(time * 0.43) * 0.18);
    const centerY = this.pointer.active
      ? clamp(this.pointer.y, marginTop + 35, this.height - marginBottom - 35)
      : this.height * 0.52 + Math.sin(time * 0.67) * this.height * 0.13;
    const orbit = Math.min(this.width * 0.15, this.height * 0.135);
    for (let step = 0; step < steps; step++) {
      for (const ribbon of this.ribbons) {
        const angle = ribbon.phase + time * 0.6 * this.twist;
        const reach = orbit * (this.pointer.down ? 0.4 : 1);
        const targetX = centerX + Math.cos(angle) * reach;
        const targetY = centerY + Math.sin(angle * 1.08) * reach * 0.8;
        for (let index = 0; index < ribbon.nodes.length; index++) {
          const node = ribbon.nodes[index];
          const parent = ribbon.nodes[index - 1];
          let ax;
          let ay;
          if (!parent) {
            ax = (targetX - node.x) * 0.11;
            ay = (targetY - node.y) * 0.11;
          } else {
            const dx = parent.x - node.x;
            const dy = parent.y - node.y;
            const distance = Math.hypot(dx, dy) || 0.001;
            const extension = distance - this.linkLength;
            const wave =
              Math.sin(time * 2.3 - index * 0.25 + ribbon.phase) *
              (0.12 + this.burst * 0.28) *
              this.twist;
            ax = (dx / distance) * extension * 0.32 - (dy / distance) * wave;
            ay = (dy / distance) * extension * 0.32 + (dx / distance) * wave;
          }
          node.vx = clamp((node.vx + ax * frame) * damping, -28, 28);
          node.vy = clamp((node.vy + ay * frame) * damping, -28, 28);
          node.x += node.vx * frame;
          node.y += node.vy * frame;
          if (parent) {
            const dx = node.x - parent.x;
            const dy = node.y - parent.y;
            const distance = Math.hypot(dx, dy) || 0.001;
            const maximum = this.linkLength * 1.6;
            if (distance > maximum) {
              node.x = parent.x + (dx / distance) * maximum;
              node.y = parent.y + (dy / distance) * maximum;
              node.vx *= 0.7;
              node.vy *= 0.7;
            }
          }
          node.x = clamp(node.x, -this.width * 0.25, this.width * 1.25);
          node.y = clamp(
            node.y,
            marginTop - 30,
            this.height - marginBottom + 30,
          );
        }
      }
    }
  }

  ribbonPath(nodes) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(nodes[0].x, nodes[0].y);
    for (let index = 1; index < nodes.length - 1; index++) {
      const a = nodes[index];
      const b = nodes[index + 1];
      ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    const end = nodes[nodes.length - 1];
    ctx.lineTo(end.x, end.y);
  }

  draw() {
    if (!this.ribbons?.length) return;
    const ctx = this.ctx;
    this.background(this.config.bg || "#c5bce7");
    ctx.strokeStyle = this.config.ink || "#363d8a";
    ctx.lineWidth = 0.75;
    ctx.globalAlpha = 0.14;
    const radius = Math.min(this.width, this.height) * 0.31;
    ctx.beginPath();
    ctx.arc(this.width / 2, this.height * 0.51, radius, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(this.width / 2, this.height * 0.51, radius + 12, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const palette = this.palettes[this.paletteIndex];
    for (const ribbon of this.ribbons) {
      ctx.strokeStyle = palette[ribbon.color];
      ctx.lineWidth = ribbon.width;
      this.ribbonPath(ribbon.nodes);
      ctx.stroke();
      // A fine seam keeps each broad ribbon distinct where the bands cross.
      ctx.strokeStyle = this.config.bg || "#c5bce7";
      ctx.globalAlpha = 0.42;
      ctx.lineWidth = 1.1;
      this.ribbonPath(ribbon.nodes);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const head = ribbon.nodes[0];
      ctx.fillStyle = palette[ribbon.color];
      ctx.beginPath();
      ctx.arc(head.x, head.y, ribbon.width * 0.57, 0, TAU);
      ctx.fill();
      ctx.fillStyle = this.config.bg || "#c5bce7";
      ctx.beginPath();
      ctx.arc(head.x, head.y, 2, 0, TAU);
      ctx.fill();
    }
  }

  resize() {
    super.resize();
    if (this.ribbons) this.makeRibbons();
  }

  destroy() {
    super.destroy();
    for (const ribbon of this.ribbons) ribbon.nodes.length = 0;
    this.ribbons.length = 0;
    this.palettes.length = 0;
  }
}
