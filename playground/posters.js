export const POSTERS = [
  {
    title: "Plant Trees",
    lines: "Plant\nTrees",
    category: "NATURE & CODE",
    description: "A small gesture. A whole new world.",
    kind: "trees",
    bg: "#ee633c",
    ink: "#173c32",
    accent: "#f5ddb1",
    serif: true,
    seed: 11,
    instruction: "Click to plant. Drag to grow a forest. Move to make wind.",
  },
  {
    title: "Rolling Hills",
    lines: "ROLLING\nHILLS",
    category: "GRAVITY & PLAY",
    description: "Go with the flow. Let gravity do the rest.",
    kind: "hills",
    bg: "#f4e5b6",
    ink: "#de4c37",
    accent: "#3b3287",
    seed: 23,
    instruction: "Click to drop a little gravity. Watch the hills do the rest.",
  },
  {
    title: "Stay Curious",
    lines: "STAY\nCURIOUS.",
    category: "TYPE & ATTRACTION",
    description: "Some things are better a little out of place.",
    kind: "type",
    bg: "#dbe878",
    ink: "#203e34",
    accent: "#547f5c",
    word: "STAY\nCURIOUS",
    seed: 37,
    instruction:
      "Move through the letters. Pull them apart. Let them find their way home.",
  },
  {
    title: "A Clearer View",
    lines: "A Clearer\nView",
    category: "REVEAL & DISCOVERY",
    description: "There is a little more beneath the surface.",
    kind: "wiper",
    bg: "#4685df",
    ink: "#edf2dc",
    accent: "#f09ec0",
    art: ["#ff7159", "#f0d95e", "#283e9c", "#f2d8c8"],
    serif: true,
    seed: 41,
    instruction:
      "Move to guide the wiper. Drag anywhere to uncover what is underneath.",
  },
  {
    title: "Elastic Loom",
    lines: "ELASTIC\nLOOM",
    category: "FABRIC & TENSION",
    description: "Pull a thread. Let everything follow.",
    kind: "cloth",
    bg: "#352832",
    ink: "#efb36e",
    accent: "#ad6c59",
    seed: 51,
    instruction:
      "Drag to grab the fabric. Pull it out of shape. Let it find its balance.",
  },
  {
    title: "Ribbon Dance",
    lines: "Ribbon\nDance",
    category: "GESTURE & ELASTICITY",
    description: "Leave a little colour in your wake.",
    kind: "ribbons",
    bg: "#c5bce7",
    ink: "#363d8a",
    accent: "#ed7249",
    serif: true,
    seed: 67,
    instruction: "Move to lead the ribbons. Click to change their rhythm.",
  },
  {
    title: "Vortex Flow",
    lines: "VORTEX\nFLOW",
    category: "FLOW & VORTICES",
    description: "A tiny influence. An entirely different path.",
    kind: "vortex",
    bg: "#efa7bd",
    ink: "#872d41",
    accent: "#bd4d66",
    seed: 71,
    instruction: "Move to bend the currents. Click to reverse the flow.",
  },
  {
    title: "Moire Motion",
    lines: "MOIRÉ\nMOTION",
    category: "PATTERNS & PERCEPTION",
    description: "Two patterns. One unexpected illusion.",
    kind: "moire",
    bg: "#efc34f",
    ink: "#513885",
    accent: "#e86c45",
    seed: 83,
    instruction: "Move to slide the patterns. Click to switch lines and rings.",
  },
];

export const mod = (n, length) => ((n % length) + length) % length;
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const lerp = (a, b, t) => a + (b - a) * t;
export function random(seed) {
  let n = seed >>> 0;
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 4294967296;
  };
}

export function drawPosterArt(canvas, data) {
  const w = 300,
    h = 330,
    dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const rng = random(data.seed);
  ctx.fillStyle = data.ink;
  ctx.strokeStyle = data.ink;
  ctx.lineCap = "round";
  if (data.kind === "trees") {
    const branch = (x, y, length, angle, depth) => {
      const ex = x + Math.cos(angle) * length,
        ey = y + Math.sin(angle) * length;
      ctx.lineWidth = Math.max(0.7, depth * 0.85);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      if (depth > 0) {
        branch(ex, ey, length * 0.73, angle - 0.43 - rng() * 0.12, depth - 1);
        branch(ex, ey, length * 0.72, angle + 0.4 + rng() * 0.15, depth - 1);
      } else {
        ctx.beginPath();
        ctx.arc(ex, ey, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    branch(151, 295, 70, -Math.PI / 2, 6);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.ellipse(150, 297, 48, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (data.kind === "hills") {
    const colors = [data.accent, data.ink, data.bg];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = colors[i];
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 3)
        ctx.lineTo(x, 160 + i * 42 + Math.sin(x * 0.017 + i * 1.7) * 28);
      ctx.lineTo(w, h);
      ctx.fill();
    }
    ctx.fillStyle = data.accent;
    ctx.beginPath();
    ctx.arc(163, 145, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = data.bg;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(163, 145, 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = data.bg;
    ctx.beginPath();
    ctx.arc(174, 133, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (data.kind === "type") {
    ctx.font = "900 128px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(data.word === "HELLO" ? "Aa" : "&", 150, 194);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = data.ink;
    for (let y = 70; y < 290; y += 6)
      for (let x = 20; x < 280; x += 6) {
        const offset =
          (Math.round(y * dpr) * canvas.width + Math.round(x * dpr)) * 4;
        if (image.data[offset + 3] > 80) {
          ctx.beginPath();
          ctx.arc(
            x + (rng() - 0.5) * 2,
            y + (rng() - 0.5) * 2,
            1.7,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
    for (let i = 0; i < 55; i++) {
      const a = rng() * Math.PI * 2,
        r = 70 + rng() * 52;
      ctx.beginPath();
      ctx.arc(
        150 + Math.cos(a) * r,
        190 + Math.sin(a) * r,
        1 + rng() * 1.4,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  } else if (data.kind === "cloth") {
    const point = (col, row) => ({
      x: 39 + col * 25 + Math.sin(row * 0.31 + col * 0.5) * row * 1.5,
      y: 79 + row * 18 + Math.sin(col * 0.6) * row * 2,
    });
    for (let row = 0; row < 10; row++)
      for (let col = 0; col < 8; col++) {
        const points = [
          point(col, row),
          point(col + 1, row),
          point(col + 1, row + 1),
          point(col, row + 1),
        ];
        ctx.fillStyle = (col + row) % 2 ? data.accent : data.ink;
        ctx.globalAlpha = 0.45 + col * 0.04;
        ctx.beginPath();
        points.forEach((p, i) =>
          i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
        );
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = data.ink;
        ctx.lineWidth = 0.65;
        ctx.stroke();
      }
    ctx.globalAlpha = 1;
    for (const col of [0, 4, 8]) {
      const p = point(col, 0);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = data.ink;
      ctx.fill();
    }
  } else if (data.kind === "ribbons") {
    const palette = [data.ink, data.accent, "#f4d6bb", data.ink, data.accent];
    ctx.lineCap = "round";
    for (let i = 0; i < palette.length; i++) {
      ctx.strokeStyle = palette[i];
      ctx.lineWidth = 13;
      ctx.beginPath();
      ctx.moveTo(28, 246 - i * 29);
      ctx.bezierCurveTo(111, 69 + i * 13, 195, 309 - i * 13, 273, 121 + i * 24);
      ctx.stroke();
    }
  } else if (data.kind === "vortex") {
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 420; i++) {
      const angle = i * 0.305;
      const r = 10 + Math.sqrt(i / 420) * 110;
      const x = 150 + Math.cos(angle) * r;
      const y = 193 + Math.sin(angle) * r * 0.82;
      ctx.strokeStyle = i % 4 ? data.ink : data.accent;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(
        x - Math.sin(angle) * (2 + r * 0.045),
        y + Math.cos(angle) * (2 + r * 0.045),
      );
      ctx.stroke();
    }
  } else if (data.kind === "moire") {
    ctx.lineWidth = 1.15;
    ctx.strokeStyle = data.ink;
    for (const x of [127, 173])
      for (let r = 5; r < 119; r += 5) {
        ctx.beginPath();
        ctx.arc(x, 193, r, 0, Math.PI * 2);
        ctx.stroke();
      }
  } else {
    ctx.save();
    ctx.translate(150, 196);
    ctx.rotate(-0.18);
    const palette = data.art || [data.accent, data.ink, data.bg];
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 3; col++) {
        const x = -102 + col * 68,
          y = -102 + row * 68;
        ctx.fillStyle = palette[(row + col) % palette.length];
        ctx.fillRect(x, y, 68, 68);
        ctx.fillStyle = palette[(row + col + 1) % palette.length];
        ctx.beginPath();
        ctx.arc(x + 34, y + 34, 28, 0, Math.PI * (row % 2 ? 1 : 2));
        ctx.fill();
      }
    ctx.fillStyle = data.bg;
    ctx.globalAlpha = 0.72;
    ctx.beginPath();
    ctx.moveTo(-102, -102);
    ctx.lineTo(102, -102);
    ctx.lineTo(102, 102);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = data.ink;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-92, 112);
    ctx.lineTo(100, -100);
    ctx.stroke();
    ctx.restore();
  }
}

export function makePoster(data, index) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `poster${data.serif ? " is-serif" : ""}`;
  button.dataset.index = String(index);
  button.style.setProperty("--poster-bg", data.bg);
  button.style.setProperty("--poster-ink", data.ink);
  button.setAttribute("aria-label", `Open ${data.title}. ${data.category}`);
  button.innerHTML =
    '<div class="poster-inner"><div class="poster-topline"><span>FORM FOLLOWS<br>FUNCTION</span><span class="poster-series">AN INTERACTIVE<br>STUDY / VOL. 01</span></div><h2 class="poster-title"></h2><canvas class="poster-art" aria-hidden="true"></canvas><div class="poster-bottomline"><span class="poster-number"></span><span class="poster-category"></span></div><span class="poster-open-mark" aria-hidden="true">↗</span></div>';
  button.querySelector(".poster-title").textContent = data.lines;
  button.querySelector(".poster-number").textContent = String(
    index + 1,
  ).padStart(2, "0");
  button.querySelector(".poster-category").textContent = data.category;
  drawPosterArt(button.querySelector("canvas"), data);
  return button;
}
