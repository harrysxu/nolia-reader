import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import path from "node:path";

const root = process.cwd();
const outputDir = path.join(root, "assets", "icons");
await mkdir(outputDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  await writeFile(path.join(outputDir, `icon-${size}.png`), createIconPng(size));
}

function createIconPng(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const documentRect = {
    x: size * 0.27,
    y: size * 0.23,
    w: size * 0.48,
    h: size * 0.55
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      let color = roundedRectAlpha(x + 0.5, y + 0.5, 0, 0, size, size, radius) > 0
        ? backgroundColor(x / Math.max(size - 1, 1), y / Math.max(size - 1, 1))
        : [0, 0, 0, 0];

      if (insideDocument(x + 0.5, y + 0.5, documentRect)) {
        color = [248, 250, 252, 255];
      }

      if (insideFold(x + 0.5, y + 0.5, documentRect)) {
        color = [219, 234, 254, 255];
      }

      const lineColor = [15, 23, 42, 255];
      const lineHeight = Math.max(2, Math.round(size * 0.055));
      const lineRadius = lineHeight / 2;
      if (roundedRectAlpha(x + 0.5, y + 0.5, size * 0.37, size * 0.46, size * 0.28, lineHeight, lineRadius)) color = lineColor;
      if (roundedRectAlpha(x + 0.5, y + 0.5, size * 0.37, size * 0.56, size * 0.28, lineHeight, lineRadius)) color = lineColor;
      if (roundedRectAlpha(x + 0.5, y + 0.5, size * 0.37, size * 0.66, size * 0.18, lineHeight, lineRadius)) color = lineColor;

      pixels[index] = color[0];
      pixels[index + 1] = color[1];
      pixels[index + 2] = color[2];
      pixels[index + 3] = color[3];
    }
  }

  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", uint32(size), uint32(size), Buffer.from([8, 6, 0, 0, 0])),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function backgroundColor(tx, ty) {
  const top = [37, 99, 235];
  const mid = [15, 118, 110];
  const bottom = [17, 24, 39];
  const t = Math.min(1, Math.max(0, tx * 0.44 + ty * 0.56));
  const [from, to, localT] = t < 0.58
    ? [top, mid, t / 0.58]
    : [mid, bottom, (t - 0.58) / 0.42];
  return [
    lerp(from[0], to[0], localT),
    lerp(from[1], to[1], localT),
    lerp(from[2], to[2], localT),
    255
  ];
}

function insideDocument(x, y, rect) {
  if (!insideRect(x, y, rect)) return false;
  const fold = rect.w * 0.32;
  return !(x > rect.x + rect.w - fold && y < rect.y + fold && y < x - (rect.x + rect.w - fold) + rect.y);
}

function insideFold(x, y, rect) {
  const fold = rect.w * 0.32;
  const left = rect.x + rect.w - fold;
  return x >= left && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + fold && y >= x - left + rect.y;
}

function insideRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function roundedRectAlpha(px, py, x, y, w, h, r) {
  const dx = Math.max(x - px, 0, px - (x + w));
  const dy = Math.max(y - py, 0, py - (y + h));
  if (dx || dy) return 0;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return Math.hypot(px - cx, py - cy) <= r ? 255 : 0;
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function chunk(type, ...parts) {
  const data = Buffer.concat(parts);
  const typeBuffer = Buffer.from(type);
  return Buffer.concat([
    uint32(data.length),
    typeBuffer,
    data,
    uint32(crc32(Buffer.concat([typeBuffer, data])))
  ]);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
