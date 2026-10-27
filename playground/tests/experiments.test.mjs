import assert from "node:assert/strict";
import test from "node:test";
import { POSTERS } from "../posters.js";
import { EXPERIMENTS } from "../experiments.js";

// These tests run the real scene updates without requiring a browser or a
// third-party canvas library. Canvas methods reject non-finite coordinates;
// raster sampling uses a deterministic filled rectangle instead of a font.
class MockCanvas extends EventTarget {
  constructor() {
    super();
    this.width = 1;
    this.height = 1;
    this.captured = new Set();
    this.context = makeContext(this);
  }
  getContext() {
    return this.context;
  }
  setPointerCapture(id) {
    this.captured.add(id);
  }
  releasePointerCapture(id) {
    this.captured.delete(id);
  }
  hasPointerCapture(id) {
    return this.captured.has(id);
  }
  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }
  pointer(type, x, y, pointerType = "mouse") {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType,
      button: 0,
    });
    this.dispatchEvent(event);
  }
}

function makeContext(canvas) {
  const calls = new Map();
  const state = {
    calls,
    canvas,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    measureText: (text) => ({ width: text.length * 18 }),
    getImageData: (x, y, width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let py = Math.floor(height * 0.3); py < height * 0.7; py++)
        for (let px = Math.floor(width * 0.2); px < width * 0.8; px++)
          data[(py * width + px) * 4 + 3] = 255;
      return { data, width, height };
    },
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
  };
  return new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        calls.set(key, (calls.get(key) || 0) + 1);
        for (const argument of args)
          if (typeof argument === "number")
            assert.ok(
              Number.isFinite(argument),
              `${String(key)} received ${argument}`,
            );
      };
    },
    set(target, key, value) {
      if (typeof value === "number")
        assert.ok(Number.isFinite(value), `${String(key)} became ${value}`);
      target[key] = value;
      return true;
    },
  });
}

function harness(callback) {
  const saved = new Map();
  const frames = new Map();
  let serial = 0;
  let now = 1000;
  let seed = 246813579;
  const nativeRandom = Math.random;
  Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const globals = {
    window: { innerWidth: 960, innerHeight: 720, devicePixelRatio: 2 },
    document: { createElement: () => new MockCanvas() },
    matchMedia: () => ({ matches: false }),
    performance: { now: () => now },
    requestAnimationFrame: (callback) => {
      frames.set(++serial, callback);
      return serial;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  for (const [key, value] of Object.entries(globals)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  const env = {
    frames,
    make(kind) {
      const config = POSTERS.find((poster) => poster.kind === kind);
      assert.ok(config, `poster config exists for ${kind}`);
      return new EXPERIMENTS[kind](new MockCanvas(), config).init();
    },
    tick(count = 1, milliseconds = 1000 / 60) {
      for (let index = 0; index < count; index++) {
        now += milliseconds;
        const pending = [...frames];
        frames.clear();
        for (const [, callback] of pending) callback(now);
      }
    },
    resize(scene, width, height, dpr = 3) {
      Object.assign(window, {
        innerWidth: width,
        innerHeight: height,
        devicePixelRatio: dpr,
      });
      scene.resize();
    },
  };
  try {
    callback(env);
  } finally {
    Math.random = nativeRandom;
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

function assertFinite(value, path = "scene", visited = new Set()) {
  if (typeof value === "number")
    assert.ok(Number.isFinite(value), `${path} is finite`);
  else if (value && typeof value === "object" && !visited.has(value)) {
    visited.add(value);
    for (const [key, nested] of Object.entries(value))
      assertFinite(nested, `${path}.${key}`, visited);
  }
}

for (const kind of [
  "trees",
  "hills",
  "type",
  "wiper",
  "cloth",
  "ribbons",
  "vortex",
  "moire",
]) {
  test(`${kind}: retina resize, one animation loop, pause/resume, and complete teardown`, () => {
    harness((env) => {
      const scene = env.make(kind);
      assert.equal(scene.canvas.width, 1920);
      assert.equal(scene.canvas.height, 1440);
      scene.start();
      scene.start();
      assert.equal(
        env.frames.size,
        1,
        "repeated start must not create extra loops",
      );
      env.tick(6);
      scene.canvas.pointer("pointerdown", 480, 360);
      scene.canvas.pointer("pointermove", 570, 300);
      env.tick(6);
      scene.canvas.pointer("pointerup", 570, 300);
      env.resize(scene, 390, 844);
      assert.equal(scene.canvas.width, 1170);
      assert.equal(scene.canvas.height, 2532);
      env.tick(6);
      scene.pause();
      assert.equal(env.frames.size, 0);
      const pausedTime = scene.time;
      env.tick(12);
      assert.equal(scene.time, pausedTime);
      scene.start();
      env.tick(2);
      assert.ok(scene.time > pausedTime);
      scene.destroy();
      assert.equal(scene.running, false);
      assert.equal(scene.raf, 0);
      assert.equal(scene.abort.signal.aborted, true);
      assert.equal(env.frames.size, 0);
      const pointerBefore = { ...scene.pointer };
      scene.canvas.pointer("pointerdown", 50, 50);
      scene.canvas.pointer("pointermove", 100, 100);
      assert.deepEqual(
        scene.pointer,
        pointerBefore,
        "destroy removes pointer listeners",
      );
    });
  });
}

for (const kind of ["cloth", "ribbons", "vortex", "moire"]) {
  test(`${kind}: sustained input and orientation changes retain finite geometry`, () => {
    harness((env) => {
      const scene = env.make(kind);
      for (let frame = 0; frame < 900; frame++) {
        if (frame % 90 === 0)
          scene.canvas.pointer(
            "pointerdown",
            window.innerWidth * 0.4,
            window.innerHeight * 0.5,
          );
        if (frame % 90 === 45)
          scene.canvas.pointer(
            "pointerup",
            window.innerWidth * 0.6,
            window.innerHeight * 0.35,
          );
        if (frame % 3 === 0)
          scene.canvas.pointer(
            "pointermove",
            window.innerWidth * (0.5 + Math.sin(frame * 0.07) * 0.42),
            window.innerHeight * (0.5 + Math.cos(frame * 0.03) * 0.4),
          );
        if (frame === 300) env.resize(scene, 320, 568, 3);
        if (frame === 600) env.resize(scene, 844, 390, 1.5);
        scene.time += 1 / 60;
        scene.update(1 / 60, scene.time);
        if (frame % 30 === 0) scene.draw();
      }
      for (const key of [
        "nodes",
        "points",
        "ribbons",
        "particles",
        "links",
        "center",
        "layer",
      ])
        if (scene[key]) assertFinite(scene[key], `${kind}.${key}`);
      scene.draw();
      scene.destroy();
      assert.equal(env.frames.size, 0);
    });
  });
}

test("cloth: dragging deforms the woven mesh while its top edge stays pinned", () => {
  harness((env) => {
    const scene = env.make("cloth");
    assert.ok(scene.nodes.length > 400);
    assert.ok(scene.links.length > scene.nodes.length);
    const index =
      Math.floor(scene.rows * 0.6) * (scene.columns + 1) +
      Math.floor(scene.columns / 2);
    const node = scene.nodes[index];
    const origin = { x: node.x, y: node.y };
    const target = { x: node.x + 80, y: node.y - 70 };
    scene.canvas.pointer("pointerdown", origin.x, origin.y);
    assert.equal(scene.grabbed, index);
    scene.canvas.pointer("pointermove", target.x, target.y);
    const initialDistance = Math.hypot(
      origin.x - target.x,
      origin.y - target.y,
    );
    for (let frame = 0; frame < 60; frame++) scene.update(1 / 60, frame / 60);
    assert.ok(
      Math.hypot(node.x - target.x, node.y - target.y) < initialDistance * 0.6,
    );
    assert.ok(Math.hypot(node.x - origin.x, node.y - origin.y) > 20);
    for (const pin of scene.nodes.filter((point) => point.pinned)) {
      assert.equal(pin.x, pin.anchorX);
      assert.equal(pin.y, pin.anchorY);
    }
    scene.canvas.pointer("pointerup", target.x, target.y);
    assert.equal(scene.grabbed, -1);
    scene.destroy();
    assert.equal(scene.nodes.length, 0);
    assert.equal(scene.links.length, 0);
  });
});

test("ribbons: click changes rhythm and pointer motion leads connected spring chains", () => {
  harness((env) => {
    const scene = env.make("ribbons");
    const averageHeadX = () =>
      scene.ribbons.reduce((total, ribbon) => total + ribbon.nodes[0].x, 0) /
      scene.ribbons.length;
    const beforeX = averageHeadX();
    scene.canvas.pointer("pointerdown", 800, 400);
    assert.equal(scene.paletteIndex, 1);
    assert.equal(scene.twist, -1);
    assert.equal(scene.burst, 1);
    assert.ok(
      scene.ribbons.some(({ nodes }) =>
        nodes.some(({ vx, vy }) => Math.hypot(vx, vy) > 1),
      ),
    );
    for (let frame = 0; frame < 180; frame++) scene.update(1 / 60, frame / 60);
    assert.ok(
      averageHeadX() > beforeX + 200,
      "spring heads follow the new pointer position",
    );
    assert.ok(scene.burst < 0.01, "the click impulse decays");
    for (const ribbon of scene.ribbons) {
      assert.ok(ribbon.nodes.length >= 30);
      assertFinite(ribbon.nodes);
    }
    scene.destroy();
    assert.equal(scene.ribbons.length, 0);
  });
});

test("vortex: click reverses continuous flow and its center springs toward the cursor", () => {
  harness((env) => {
    const scene = env.make("vortex");
    assert.ok(scene.particles.length >= 480 && scene.particles.length <= 1200);
    assert.ok(
      scene.particles.every((particle) => !("homeX" in particle)),
      "flow particles have no letter-shaped home",
    );
    const beforeCenterX = scene.center.x;
    const oldDirection = scene.direction;
    scene.canvas.pointer("pointerdown", 760, 430);
    assert.equal(scene.direction, -oldDirection);
    assert.equal(scene.pulse, 1);
    for (let frame = 0; frame < 240; frame++) scene.update(1 / 60, frame / 60);
    assert.ok(
      scene.swirl < -0.9,
      "the field eases into the reversed circulation",
    );
    assert.ok(scene.center.x > beforeCenterX + 200);
    assert.ok(scene.pulse < 0.001);
    assert.ok(scene.particles.some(({ vx, vy }) => Math.hypot(vx, vy) > 20));
    scene.draw();
    assert.ok(
      scene.trailCtx.calls.get("lineTo") > 0,
      "moving particles paint persistent paths",
    );
    scene.destroy();
    assert.equal(scene.particles.length, 0);
    assert.equal(scene.trail, null);
    assert.equal(scene.trailCtx, null);
  });
});

test("moire: two optical gratings slide with a spring and switch between lines and rings", () => {
  harness((env) => {
    const scene = env.make("moire");
    assert.equal(scene.mode, 0);
    const plateContext = scene.plate.getContext("2d");
    assert.ok(
      plateContext.calls.get("lineTo") > 0,
      "the initial plate uses lines",
    );
    assert.equal(plateContext.calls.get("arc") || 0, 0);
    scene.canvas.pointer(
      "pointermove",
      scene.centerX + scene.radius,
      scene.centerY,
    );
    scene.update(1 / 60, 0);
    assert.ok(
      scene.layer.x > 0 && scene.layer.x < scene.radius * 0.19,
      "the plate accelerates toward the cursor without jumping",
    );
    for (let frame = 1; frame < 180; frame++) scene.update(1 / 60, frame / 60);
    assert.ok(Math.abs(scene.layer.x - scene.radius * 0.19) < 0.1);
    scene.canvas.pointer("pointerdown", scene.centerX, scene.centerY);
    assert.equal(scene.mode, 1);
    assert.ok(
      plateContext.calls.get("arc") > 10,
      "switching mode redraws the plate as concentric rings",
    );
    scene.canvas.pointer("pointerup", scene.centerX, scene.centerY);
    scene.canvas.pointer("pointerdown", scene.centerX, scene.centerY);
    assert.equal(scene.mode, 0);
    scene.draw();
    scene.destroy();
    assert.equal(scene.plate, null);
    assert.equal(scene.layer, null);
  });
});
