import assert from "node:assert/strict";
import test from "node:test";
import { POSTERS } from "../posters.js";
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
    setAttribute() {},
  }));
  wheel.physics = new WheelPhysics(POSTERS.length);
  wheel.reduced = false;
  wheel.activeIndex = -1;
  wheel.onChange = () => {};
  return wheel;
}

function corners(wheel, index) {
  const pose = wheel.pose(index);
  const angle = (pose.angle * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const halfWidth = (wheel.cardWidth * pose.scale) / 2;
  const halfHeight = (wheel.cardHeight * pose.scale) / 2;
  return [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ].map(([x, y]) => [pose.x + x * cos - y * sin, pose.y + x * sin + y * cos]);
}

// Separating-axis test on the actual rotated corners. A positive result is a
// clear gap; a negative result means the two poster rectangles overlap.
function separation(first, second) {
  let largestGap = -Infinity;
  for (const polygon of [first, second]) {
    for (let i = 0; i < 2; i++) {
      const edgeX = polygon[i + 1][0] - polygon[i][0];
      const edgeY = polygon[i + 1][1] - polygon[i][1];
      const length = Math.hypot(edgeX, edgeY);
      const normalX = -edgeY / length;
      const normalY = edgeX / length;
      const project = (points) =>
        points.map(([x, y]) => x * normalX + y * normalY);
      const a = project(first);
      const b = project(second);
      largestGap = Math.max(
        largestGap,
        Math.min(...a) - Math.max(...b),
        Math.min(...b) - Math.max(...a),
      );
    }
  }
  return largestGap;
}

test("the wheel contains exactly eight distinct posters", () => {
  assert.equal(POSTERS.length, 8);
  assert.equal(new Set(POSTERS.map(({ title }) => title)).size, 8);
});

for (const [width, height] of viewports) {
  test(`rotated posters stay apart at ${width}×${height}`, () => {
    const originalWindow = Object.getOwnPropertyDescriptor(
      globalThis,
      "window",
    );
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { innerWidth: width, innerHeight: height },
    });
    try {
      const wheel = makeWheel();
      // Exercise the real layout and transform calculation rather than copying
      // its spacing formula into this test.
      wheel.resize();
      assert.equal(wheel.cards.length, 8);
      assert.ok(wheel.cardWidth > 0 && wheel.cardHeight > 0);
      assert.ok(Number.isFinite(wheel.step) && wheel.step > 0);
      const positions = Array.from({ length: 321 }, (_, i) => i / 40);
      positions.push(-8.125, 21.375);
      let narrowestGap = Infinity;
      let closestPair;
      for (const position of positions) {
        wheel.physics.position = position;
        for (const velocity of [-0.25, 0, 0.25]) {
          wheel.physics.velocity = velocity;
          const polygons = wheel.cards.map((_, index) => corners(wheel, index));
          for (let first = 0; first < polygons.length; first++) {
            for (let second = first + 1; second < polygons.length; second++) {
              const gap = separation(polygons[first], polygons[second]);
              if (gap < narrowestGap) {
                narrowestGap = gap;
                closestPair = { first, second, position, velocity };
              }
            }
          }
        }
      }
      assert.ok(
        narrowestGap >= 12,
        `Keep at least 12 CSS px between every pair; got ${narrowestGap.toFixed(3)} px at ${JSON.stringify(closestPair)}`,
      );
    } finally {
      if (originalWindow) {
        Object.defineProperty(globalThis, "window", originalWindow);
      } else {
        delete globalThis.window;
      }
    }
  });
}
