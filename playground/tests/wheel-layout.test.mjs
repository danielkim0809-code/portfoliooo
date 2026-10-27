import assert from "node:assert/strict";
import test from "node:test";
import { POSTERS, mod } from "../posters.js";
import { EXPERIMENTS } from "../experiments.js";
import { PosterWheel, WheelPhysics } from "../wheel.js";

const viewports = [
  [1280, 800],
  [1920, 1080],
  [390, 844],
  [320, 568],
  [844, 390],
  [3440, 390],
  [2560, 1440],
  [800, 1600],
];

function makeWheel() {
  const wheel = Object.create(PosterWheel.prototype);
  wheel.stage = { style: { setProperty() {} } };
  wheel.cards = POSTERS.map(() => ({
    style: { setProperty() {} },
    classList: { toggle() {} },
    setAttribute(name, value) {
      this[name] = value;
    },
  }));
  wheel.physics = new WheelPhysics(POSTERS.length);
  wheel.reduced = false;
  wheel.activeIndex = -1;
  wheel.onChange = () => {};
  wheel.start = () => {};
  return wheel;
}

function withViewport(width, height, callback) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { innerWidth: width, innerHeight: height },
  });
  try {
    return callback();
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else delete globalThis.window;
  }
}

function settle(physics, frames = 1) {
  for (let step = 0; step < 2400; step++) {
    if (!physics.update(frames, 1000 + step * (1000 / 60) * frames)) return;
  }
  assert.fail("the wheel spring did not settle");
}

test("eight posters lead to eight different interaction engines", () => {
  assert.equal(POSTERS.length, 8);
  assert.equal(new Set(POSTERS.map(({ title }) => title)).size, 8);
  assert.equal(new Set(POSTERS.map(({ kind }) => kind)).size, 8);
  const constructors = POSTERS.map(({ kind }) => EXPERIMENTS[kind]);
  constructors.forEach((Constructor) =>
    assert.equal(typeof Constructor, "function"),
  );
  assert.equal(new Set(constructors).size, 8);
});

test("inertia uses 0.94 friction and the spring settles at different frame rates", () => {
  const physics = new WheelPhysics(8);
  physics.impulse(0.2, 0);
  physics.update(1, 16);
  assert.equal(physics.friction, 0.94);
  assert.ok(Math.abs(physics.velocity - 0.188) < 1e-12);
  assert.ok(Math.abs(physics.position - 0.188) < 1e-12);
  for (const frames of [0.5, 1, 2]) {
    const candidate = new WheelPhysics(8);
    candidate.position = -3.73;
    candidate.impulse(0.19, 0);
    settle(candidate, frames);
    assert.equal(candidate.position, Math.round(candidate.position));
    assert.equal(candidate.velocity, 0);
  }
});

test("selection wraps by the shortest route and navigation cycles through all eight", () => {
  const wheel = makeWheel();
  wheel.physics.position = 7;
  wheel.physics.select(0);
  assert.equal(wheel.physics.target, 8);
  settle(wheel.physics);
  wheel.physics.select(7);
  assert.equal(wheel.physics.target, 7);
  settle(wheel.physics);
  const visited = [];
  for (let index = 0; index < 8; index++) {
    wheel.nudge(1);
    settle(wheel.physics);
    visited.push(mod(Math.round(wheel.physics.position), 8));
  }
  assert.deepEqual(visited, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(new Set(visited).size, 8);
});

for (const [width, height] of viewports) {
  test(`the dense poster fan stays finite and centers every card at ${width}×${height}`, () => {
    withViewport(width, height, () => {
      const wheel = makeWheel();
      wheel.resize();
      assert.equal(wheel.cards.length, 8);
      assert.ok(wheel.cardWidth > 0 && wheel.cardHeight > 0);
      assert.ok(Number.isFinite(wheel.step) && wheel.step > 0);
      assert.equal(
        wheel.cardHeight,
        Math.min(height * 0.48, 410, width < 700 ? width * 0.91 : 430),
      );
      assert.ok(
        wheel.pivotY >= height * 1.5,
        "the orbit pivot stays below the screen",
      );
      assert.ok(
        wheel.radius * wheel.step < wheel.cardWidth,
        "keep the original dense fan composition",
      );
      const positions = Array.from({ length: 65 }, (_, i) => i / 8);
      positions.push(-8.125, 21.375);
      for (const position of positions) {
        wheel.physics.position = position;
        for (const velocity of [-0.38, 0, 0.38]) {
          wheel.physics.velocity = velocity;
          wheel.render();
          const current = wheel.cards.filter(
            (card) => card["aria-current"] === "true",
          );
          assert.equal(current.length, 1);
          assert.equal(
            wheel.cards.filter((card) => card.tabIndex === 0).length,
            1,
          );
          for (let index = 0; index < 8; index++) {
            const pose = wheel.pose(index);
            for (const value of Object.values(pose))
              assert.ok(Number.isFinite(value));
            assert.ok(pose.scale > 0 && pose.scale <= 1);
            assert.ok(!/NaN|Infinity/.test(wheel.cards[index].style.transform));
            assert.ok(
              ["visible", "hidden"].includes(
                wheel.cards[index].style.visibility,
              ),
            );
          }
        }
      }
      wheel.physics.velocity = 0;
      for (let index = 0; index < 8; index++) {
        wheel.physics.position = index;
        wheel.render();
        const centered = wheel.pose(index);
        assert.ok(Math.abs(centered.x - width / 2) < 1e-9);
        assert.ok(Math.abs(centered.y - wheel.centerY) < 1e-9);
        assert.equal(centered.angle, 0);
        assert.equal(wheel.activeIndex, index);
      }
    });
  });
}
