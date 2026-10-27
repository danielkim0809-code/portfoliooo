import { clamp } from "./posters.js";

export class CanvasExperiment {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.config = config;
    this.ctx = canvas.getContext("2d");
    this.abort = new AbortController();
    this.running = false;
    this.raf = 0;
    this.time = 0;
    this.pointer = {
      x: -1000,
      y: -1000,
      px: -1000,
      py: -1000,
      vx: 0,
      vy: 0,
      down: false,
      active: false,
    };
  }
  init() {
    this.resize();
    this.onInit();
    const options = { signal: this.abort.signal };
    this.canvas.addEventListener(
      "pointerdown",
      (event) => {
        event.preventDefault();
        this.setPointer(event);
        this.pointer.down = true;
        this.canvas.setPointerCapture(event.pointerId);
        this.onPointerDown(event);
      },
      options,
    );
    this.canvas.addEventListener(
      "pointermove",
      (event) => {
        this.setPointer(event);
        this.onPointerMove(event);
      },
      options,
    );
    const up = (event) => {
      this.pointer.down = false;
      if (event.pointerType !== "mouse") this.pointer.active = false;
      this.onPointerUp(event);
    };
    this.canvas.addEventListener("pointerup", up, options);
    this.canvas.addEventListener("pointercancel", up, options);
    this.canvas.addEventListener("lostpointercapture", up, options);
    this.canvas.addEventListener(
      "pointerleave",
      () => {
        if (!this.pointer.down) this.pointer.active = false;
      },
      options,
    );
    this.draw();
    return this;
  }
  onInit() {}
  onPointerDown() {}
  onPointerMove() {}
  onPointerUp() {}
  setPointer(event) {
    const p = this.pointer;
    p.px = p.x;
    p.py = p.y;
    p.x = event.clientX;
    p.y = event.clientY;
    p.vx = p.active ? clamp(p.x - p.px, -90, 90) : 0;
    p.vy = p.active ? clamp(p.y - p.py, -90, 90) : 0;
    p.active = true;
  }
  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
  update() {}
  draw() {}
  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const frame = (now) => {
      if (!this.running) return;
      const dt = clamp((now - this.lastTime) / 1000, 0.001, 1 / 30);
      this.lastTime = now;
      this.time += dt;
      this.update(dt, this.time);
      this.draw();
      this.pointer.vx *= 0.8;
      this.pointer.vy *= 0.8;
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }
  pause() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
  destroy() {
    this.pause();
    this.abort.abort();
  }
  background(color = this.config.bg) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }
}
