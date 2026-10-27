import { POSTERS, clamp, mod, makePoster } from "./posters.js";

// Position is measured in posters; velocity is posters per 60 Hz frame.
export class WheelPhysics {
  constructor(count) {
    this.count = count;
    this.position = 0;
    this.velocity = 0;
    this.friction = 0.94;
    this.target = null;
    this.dragging = false;
    this.lastInput = -Infinity;
  }
  impulse(amount, now) {
    this.velocity = clamp(this.velocity + amount, -0.38, 0.38);
    this.target = null;
    this.lastInput = now;
  }
  select(index) {
    const diff =
      mod(
        index - mod(Math.round(this.position), this.count) + this.count / 2,
        this.count,
      ) -
      this.count / 2;
    this.target = Math.round(this.position) + diff;
    this.velocity *= 0.25;
    this.lastInput = -Infinity;
  }
  update(frames, now) {
    if (this.dragging) return true;
    this.velocity *= Math.pow(this.friction, frames);
    if (
      this.target === null &&
      Math.abs(this.velocity) < 0.055 &&
      now - this.lastInput > 110
    )
      this.target = Math.round(this.position);
    if (this.target !== null) {
      this.velocity += (this.target - this.position) * 0.027 * frames;
      this.velocity *= Math.pow(0.79, frames);
    }
    this.position += this.velocity * frames;
    if (
      this.target !== null &&
      Math.abs(this.target - this.position) < 0.00035 &&
      Math.abs(this.velocity) < 0.0002
    ) {
      this.position = this.target;
      this.velocity = 0;
      return false;
    }
    return true;
  }
}

export class PosterWheel {
  constructor(stage, container, onSelect, onChange) {
    this.stage = stage;
    this.container = container;
    this.onSelect = onSelect;
    this.onChange = onChange;
    this.physics = new WheelPhysics(POSTERS.length);
    this.cards = POSTERS.map(makePoster);
    this.cards.forEach((card) => container.append(card));
    this.abort = new AbortController();
    this.running = false;
    this.raf = 0;
    this.lastFrame = 0;
    this.pointer = null;
    this.activeIndex = -1;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const options = { signal: this.abort.signal };
    stage.addEventListener(
      "pointerdown",
      (event) => this.pointerDown(event),
      options,
    );
    stage.addEventListener(
      "pointermove",
      (event) => this.pointerMove(event),
      options,
    );
    stage.addEventListener(
      "pointerup",
      (event) => this.pointerUp(event),
      options,
    );
    stage.addEventListener(
      "pointercancel",
      () => this.cancelPointer(),
      options,
    );
    stage.addEventListener(
      "lostpointercapture",
      () => this.cancelPointer(),
      options,
    );
    stage.addEventListener("wheel", (event) => this.wheel(event), {
      ...options,
      passive: false,
    });
    stage.addEventListener(
      "click",
      (event) => {
        if (event.detail === 0) {
          const card = event.target.closest(".poster");
          if (card) this.onSelect(Number(card.dataset.index), card);
        }
      },
      options,
    );
    this.resize();
    this.render();
  }
  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.cardHeight = Math.min(
      this.height * 0.48,
      410,
      this.width < 700 ? this.width * 0.91 : 430,
    );
    this.cardWidth = this.cardHeight / 1.43;
    this.centerY = this.height * (this.height < 600 ? 0.55 : 0.57);
    this.pivotY = this.height * 1.95;
    this.radius = this.pivotY - this.centerY;
    this.step = (this.cardWidth * 0.86) / this.radius;
    for (const card of this.cards) {
      card.style.width = `${this.cardWidth}px`;
      card.style.height = `${this.cardHeight}px`;
    }
    this.stage.style.setProperty("--orbit-size", `${this.radius * 2}px`);
    this.stage.style.setProperty(
      "--orbit-top",
      `${this.pivotY - this.radius + this.cardHeight * 0.5}px`,
    );
    this.render();
  }
  pose(index) {
    const relative =
      mod(index - this.physics.position + POSTERS.length / 2, POSTERS.length) -
      POSTERS.length / 2;
    const angle = relative * this.step;
    const speed = clamp(this.physics.velocity, -0.25, 0.25);
    return {
      x: this.width / 2 + Math.sin(angle) * this.radius,
      y: this.pivotY - Math.cos(angle) * this.radius,
      angle: (angle * 180) / Math.PI + (this.reduced ? 0 : speed * -7),
      scale: 1 - (this.reduced ? 0 : Math.min(Math.abs(speed) * 0.07, 0.018)),
      relative,
    };
  }
  render() {
    const selected = mod(Math.round(this.physics.position), POSTERS.length);
    this.cards.forEach((card, index) => {
      const pose = this.pose(index),
        visible =
          Math.abs(pose.x - this.width / 2) <
          this.width / 2 + this.cardWidth * 1.2;
      card.style.transform = `translate3d(${pose.x - this.cardWidth / 2}px,${pose.y - this.cardHeight / 2}px,0) rotate(${pose.angle}deg) scale(${pose.scale})`;
      card.style.zIndex = String(
        100 - Math.round(Math.abs(pose.relative) * 10),
      );
      card.style.visibility = visible ? "visible" : "hidden";
      card.tabIndex = index === selected ? 0 : -1;
      card.classList.toggle("is-current", index === selected);
      card.setAttribute("aria-current", index === selected ? "true" : "false");
    });
    if (selected !== this.activeIndex) {
      this.activeIndex = selected;
      this.onChange(selected);
    }
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    const tick = (now) => {
      if (!this.running) return;
      const frames = clamp((now - this.lastFrame) / (1000 / 60), 0.1, 2);
      this.lastFrame = now;
      const moving = this.physics.update(frames, now);
      this.render();
      if (moving || this.pointer) this.raf = requestAnimationFrame(tick);
      else {
        this.running = false;
        this.raf = 0;
      }
    };
    this.raf = requestAnimationFrame(tick);
  }
  pause() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.cancelPointer();
  }
  pointerDown(event) {
    if (event.button !== 0 || this.pointer) return;
    this.pointer = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      distance: 0,
      index: event.target.closest(".poster")?.dataset.index,
    };
    this.physics.dragging = true;
    this.physics.target = null;
    this.physics.velocity = 0;
    this.stage.setPointerCapture(event.pointerId);
    this.stage.classList.add("is-dragging");
    this.start();
  }
  pointerMove(event) {
    if (!this.pointer || event.pointerId !== this.pointer.id) return;
    const dx = event.clientX - this.pointer.lastX,
      elapsed = Math.max(8, event.timeStamp - this.pointer.lastTime),
      distance = Math.hypot(
        event.clientX - this.pointer.startX,
        event.clientY - this.pointer.startY,
      );
    this.pointer.distance = Math.max(this.pointer.distance, distance);
    const delta = -dx / (this.cardWidth * 0.86);
    this.physics.position += delta;
    this.physics.velocity =
      this.physics.velocity * 0.38 +
      clamp(delta / (elapsed / (1000 / 60)), -0.45, 0.45) * 0.62;
    this.pointer.lastX = event.clientX;
    this.pointer.lastTime = event.timeStamp;
    this.physics.lastInput = performance.now();
    this.render();
  }
  pointerUp(event) {
    if (!this.pointer || event.pointerId !== this.pointer.id) return;
    const pointer = this.pointer;
    this.pointer = null;
    this.physics.dragging = false;
    this.stage.classList.remove("is-dragging");
    if (this.stage.hasPointerCapture(event.pointerId))
      this.stage.releasePointerCapture(event.pointerId);
    if (pointer.distance < 7 && pointer.index !== undefined) {
      this.physics.velocity = 0;
      const index = Number(pointer.index);
      this.onSelect(index, this.cards[index]);
      return;
    }
    if (event.timeStamp - pointer.lastTime > 95) this.physics.velocity = 0;
    this.physics.lastInput = performance.now();
    this.start();
  }
  cancelPointer() {
    this.pointer = null;
    this.physics.dragging = false;
    this.stage.classList.remove("is-dragging");
  }
  wheel(event) {
    event.preventDefault();
    const mode =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1;
    const delta =
      (Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY) * mode;
    this.physics.impulse(clamp(delta, -160, 160) * 0.0011, performance.now());
    this.start();
  }
  nudge(direction) {
    this.physics.select(
      mod(Math.round(this.physics.position) + direction, POSTERS.length),
    );
    this.start();
  }
  destroy() {
    this.pause();
    this.abort.abort();
    this.container.replaceChildren();
  }
}
