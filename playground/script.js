import { POSTERS, mod } from "./posters.js";
import { PosterWheel } from "./wheel.js";
import { EXPERIMENTS } from "./experiments.js";

export class Playground {
  constructor() {
    this.state = "wheel";
    this.active = null;
    this.index = 0;
    this.abort = new AbortController();
    this.animations = [];
    this.resizeFrame = 0;
    this.root = document.querySelector("#playground");
    this.stage = document.querySelector("#wheel-stage");
    this.view = document.querySelector("#experiment-view");
    this.canvas = document.querySelector("#experiment-canvas");
    this.back = document.querySelector("#back-button");
    this.layer = document.querySelector("#transition-layer");
    this.title = document.querySelector("#selection-title");
    this.description = document.querySelector("#selection-description");
    this.category = document.querySelector("#selection-category");
    this.announcement = document.querySelector("#wheel-announcement");
    this.progress = document.querySelector("#wheel-progress");
    POSTERS.forEach(() => this.progress.append(document.createElement("i")));
    this.wheel = new PosterWheel(
      this.stage,
      document.querySelector("#poster-wheel"),
      (index) => this.open(index),
      (index) => this.selection(index),
    );
    const options = { signal: this.abort.signal };
    this.back.addEventListener("click", () => this.close(), options);
    document.querySelector("#previous-poster").addEventListener(
      "click",
      () => {
        if (this.state === "wheel") this.wheel.nudge(-1);
      },
      options,
    );
    document.querySelector("#next-poster").addEventListener(
      "click",
      () => {
        if (this.state === "wheel") this.wheel.nudge(1);
      },
      options,
    );
    window.addEventListener("keydown", (event) => this.keydown(event), options);
    window.addEventListener("resize", () => this.resize(), options);
    window.visualViewport?.addEventListener(
      "resize",
      () => this.resize(),
      options,
    );
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) {
          this.wheel.pause();
          this.active?.pause();
        } else if (this.state === "wheel") this.wheel.start();
        else if (this.state === "open") this.active?.start();
      },
      options,
    );
    window.addEventListener(
      "pagehide",
      (event) => {
        if (event.persisted) {
          this.wheel.pause();
          this.active?.pause();
        } else this.destroy();
      },
      options,
    );
    window.addEventListener(
      "pageshow",
      (event) => {
        if (event.persisted) {
          if (this.state === "wheel") this.wheel.start();
          else if (this.state === "open") this.active?.start();
        }
      },
      options,
    );
    document.body.dataset.state = "wheel";
    this.wheel.start();
  }
  selection(index) {
    this.index = index;
    const data = POSTERS[index];
    this.title.textContent = data.title;
    this.description.textContent = data.description;
    this.category.textContent = `${String(index + 1).padStart(2, "0")} / 10 — ${data.category}`;
    [...this.progress.children].forEach((item, i) =>
      item.classList.toggle("is-current", i === index),
    );
    clearTimeout(this.announceTimer);
    this.announceTimer = setTimeout(() => {
      this.announcement.textContent = `${index + 1} of ${POSTERS.length}. ${data.title}. Press Enter to explore.`;
    }, 350);
  }
  keydown(event) {
    if (this.state === "wheel") {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        this.wheel.nudge(event.key === "ArrowLeft" ? -1 : 1);
      }
      if (
        (event.key === "Enter" || event.key === " ") &&
        (document.activeElement === this.stage ||
          document.activeElement === document.body)
      ) {
        event.preventDefault();
        this.open(mod(Math.round(this.wheel.physics.position), POSTERS.length));
      }
    } else {
      if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
      if (event.key === "Tab") {
        event.preventDefault();
        this.back.focus();
      }
    }
  }
  resize() {
    cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = requestAnimationFrame(() => {
      this.wheel.resize();
      this.active?.resize();
      if (this.active && !this.active.running) this.active.draw();
      this.resizeFrame = 0;
    });
  }
  setState(state) {
    this.state = state;
    document.body.dataset.state = state;
  }
  makeCover(index) {
    const source = this.wheel.cards[index],
      cover = document.createElement("div");
    cover.className = `${source.className} transition-poster`;
    cover.style.cssText = source.style.cssText;
    cover.style.visibility = "visible";
    cover.style.transform = "none";
    cover.style.zIndex = "20";
    cover.innerHTML = source.innerHTML;
    const from = source.querySelector("canvas"),
      to = cover.querySelector("canvas");
    to.width = from.width;
    to.height = from.height;
    to.getContext("2d").drawImage(from, 0, 0);
    this.layer.replaceChildren(cover);
    return cover;
  }
  geometry(index) {
    const pose = this.wheel.pose(index);
    return {
      left: `${pose.x - (this.wheel.cardWidth * pose.scale) / 2}px`,
      top: `${pose.y - (this.wheel.cardHeight * pose.scale) / 2}px`,
      width: `${this.wheel.cardWidth * pose.scale}px`,
      height: `${this.wheel.cardHeight * pose.scale}px`,
      transform: `rotate(${pose.angle}deg)`,
    };
  }
  fullscreen() {
    return {
      left: "0px",
      top: "0px",
      width: `${window.innerWidth}px`,
      height: `${window.innerHeight}px`,
      transform: "rotate(0deg)",
    };
  }
  animate(element, keyframes, options) {
    const animation = element.animate(keyframes, options);
    this.animations.push(animation);
    return animation;
  }
  async open(index) {
    if (this.state !== "wheel") return;
    this.setState("opening");
    this.wantsClose = false;
    this.activeIndex = index;
    this.returnFocus = document.activeElement;
    this.wheel.pause();
    const data = POSTERS[index],
      cover = this.makeCover(index),
      from = this.geometry(index),
      duration = this.wheel.reduced ? 180 : 760;
    Object.assign(cover.style, from);
    this.root.inert = true;
    this.view.style.setProperty("--scene-bg", data.bg);
    this.view.style.setProperty("--scene-ink", data.ink);
    this.view.style.visibility = "hidden";
    this.view.hidden = false;
    document.querySelector("#experiment-number").textContent =
      `${String(index + 1).padStart(2, "0")} / 10 — ${data.category}`;
    document.querySelector("#experiment-title").textContent = data.title;
    document.querySelector("#experiment-instruction").textContent =
      data.instruction;
    this.canvas.dataset.experiment = data.kind;
    this.canvas.setAttribute(
      "aria-label",
      `${data.title}. ${data.instruction}`,
    );
    try {
      this.active = new EXPERIMENTS[data.kind](this.canvas, data).init();
      this.animate(
        cover.querySelector(".poster-inner"),
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: duration * 0.6, fill: "forwards", easing: "ease" },
      );
      await this.animate(cover, [from, this.fullscreen()], {
        duration,
        fill: "forwards",
        easing: "cubic-bezier(.16,1,.3,1)",
      }).finished;
      if (this.state === "destroyed") return;
      Object.assign(cover.style, this.fullscreen());
      this.view.style.visibility = "visible";
      this.view.classList.add("is-open");
      if (!document.hidden) this.active.start();
      await this.animate(cover, [{ opacity: 1 }, { opacity: 0 }], {
        duration: this.wheel.reduced ? 70 : 190,
        fill: "forwards",
      }).finished;
      if (this.state === "destroyed") return;
      this.clearTransition();
      this.setState("open");
      this.back.focus({ preventScroll: true });
      if (this.wantsClose) this.close();
    } catch (error) {
      if (this.state !== "destroyed") {
        this.active?.destroy();
        this.active = null;
        this.view.hidden = true;
        this.root.inert = false;
        this.clearTransition();
        this.setState("wheel");
        this.wheel.start();
        this.announcement.textContent =
          "This experiment could not be opened. Please try another poster.";
        console.error("Canvas experiment failed to open.", error);
      }
    }
  }
  async close() {
    if (this.state === "opening") {
      this.wantsClose = true;
      return;
    }
    if (this.state !== "open") return;
    this.setState("closing");
    this.active.pause();
    this.view.classList.remove("is-open");
    this.wheel.resize();
    const cover = this.makeCover(this.activeIndex),
      from = this.fullscreen(),
      to = this.geometry(this.activeIndex),
      duration = this.wheel.reduced ? 180 : 700;
    Object.assign(cover.style, from);
    const inner = cover.querySelector(".poster-inner");
    inner.style.opacity = "0";
    const snapshot = document.createElement("canvas");
    snapshot.className = "transition-snapshot";
    snapshot.width = this.canvas.width;
    snapshot.height = this.canvas.height;
    snapshot.getContext("2d").drawImage(this.canvas, 0, 0);
    cover.append(snapshot);
    this.view.style.visibility = "hidden";
    this.animate(
      snapshot,
      [
        { opacity: 1, offset: 0 },
        { opacity: 0, offset: 0.65 },
        { opacity: 0, offset: 1 },
      ],
      { duration, fill: "forwards" },
    );
    this.animate(
      inner,
      [
        { opacity: 0, offset: 0 },
        { opacity: 0, offset: 0.25 },
        { opacity: 1, offset: 0.85 },
        { opacity: 1, offset: 1 },
      ],
      { duration, fill: "forwards" },
    );
    try {
      await this.animate(cover, [from, to], {
        duration,
        fill: "forwards",
        easing: "cubic-bezier(.22,1,.36,1)",
      }).finished;
    } catch {
      /* Page teardown cancels the transition. */
    }
    if (this.state === "destroyed") return;
    snapshot.width = 1;
    snapshot.height = 1;
    this.active.destroy();
    this.active = null;
    this.view.hidden = true;
    this.root.inert = false;
    this.clearTransition();
    this.setState("wheel");
    this.wheel.render();
    this.wheel.start();
    const focus = this.returnFocus?.isConnected
      ? this.returnFocus
      : this.wheel.cards[this.activeIndex];
    focus.focus({ preventScroll: true });
  }
  clearTransition() {
    for (const animation of this.animations) animation.cancel();
    this.animations.length = 0;
    this.layer.replaceChildren();
  }
  destroy() {
    this.setState("destroyed");
    clearTimeout(this.announceTimer);
    cancelAnimationFrame(this.resizeFrame);
    this.abort.abort();
    this.active?.destroy();
    this.active = null;
    this.wheel.destroy();
    this.clearTransition();
  }
}

new Playground();
