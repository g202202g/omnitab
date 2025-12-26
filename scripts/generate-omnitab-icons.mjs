/**
 * 生成 OmniTab 的扩展图标（PNG 多尺寸）与配套 SVG。
 *
 * 设计目标：
 * - 小尺寸也清晰可辨：圆底 + 白色“O”环 + 小卫星点
 * - 纯 Node 内置能力实现：不依赖外部二进制与第三方包
 *
 * 用法：
 * - `node scripts/generate-omnitab-icons.mjs`
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { useLog } from './useLog.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'icon');

const SIZES = [16, 32, 48, 96, 128];
const logger = useLog('omnitab-icons');

const hexToRgb = (hex) => {
  const clean = hex.replace('#', '').trim();
  const value = Number.parseInt(
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean,
    16,
  );
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

const lerp = (a, b, t) => a + (b - a) * t;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

const u32be = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
};

const chunk = (type, data) => {
  const typeBuf = Buffer.from(type, 'ascii');
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const len = u32be(payload.length);
  const crc = u32be(crc32(Buffer.concat([typeBuf, payload])));
  return Buffer.concat([len, typeBuf, payload, crc]);
};

const encodePng = (width, height, rgba) => {
  // 每行以 filter=0 开头
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
};

const setPixel = (rgba, width, x, y, r, g, b, a) => {
  const idx = (y * width + x) * 4;
  rgba[idx] = r;
  rgba[idx + 1] = g;
  rgba[idx + 2] = b;
  rgba[idx + 3] = a;
};

const drawIcon = (size) => {
  const rgba = Buffer.alloc(size * size * 4, 0);

  // 尽量贴近 entrypoints/newtab/style.css 的极简灰阶风格（OKLCH 0 chroma）
  // 这里使用 sRGB 的“保守近似值”，用于扩展静态图标（无法跟随主题变量动态变化）。
  const bg = hexToRgb('#111111');
  const border = hexToRgb('#E5E7EB');
  const white = { r: 255, g: 255, b: 255 };

  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const rBg = size * 0.46;
  const borderW = Math.max(1.0, size * 0.06);
  const ringOuter = size * 0.28;
  const ringInner = size * 0.18;

  const dotR = Math.max(1.2, size * 0.05);
  const dotAngle = -Math.PI / 4; // 右上
  const dotCx = cx + Math.cos(dotAngle) * (ringOuter * 0.95);
  const dotCy = cy + Math.sin(dotAngle) * (ringOuter * 0.95);

  // 4x4 超采样抗锯齿
  const samples = 4;
  const invSamples = 1 / (samples * samples);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let bgCover = 0;
      let borderCover = 0;
      let ringCover = 0;
      let dotCover = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;
          const dx = px - cx;
          const dy = py - cy;
          const d = Math.hypot(dx, dy);

          if (d <= rBg) {
            bgCover += 1;
            if (d >= rBg - borderW) borderCover += 1;
          }

          if (d >= ringInner && d <= ringOuter) ringCover += 1;

          const ddx = px - dotCx;
          const ddy = py - dotCy;
          if (Math.hypot(ddx, ddy) <= dotR) dotCover += 1;
        }
      }

      if (bgCover === 0) continue;

      const aBg = Math.round(bgCover * invSamples * 255);

      // 背景先画
      let outR = bg.r;
      let outG = bg.g;
      let outB = bg.b;
      let outA = aBg;

      // 外边框（浅灰）
      if (borderCover > 0) {
        const a = borderCover * invSamples;
        outR = Math.round(lerp(outR, border.r, a));
        outG = Math.round(lerp(outG, border.g, a));
        outB = Math.round(lerp(outB, border.b, a));
      }

      // 环形“O”覆盖（白色）
      if (ringCover > 0) {
        const a = ringCover * invSamples;
        outR = Math.round(lerp(outR, white.r, a));
        outG = Math.round(lerp(outG, white.g, a));
        outB = Math.round(lerp(outB, white.b, a));
      }

      // 小卫星点（白色，优先级更高）
      if (dotCover > 0) {
        const a = dotCover * invSamples;
        outR = Math.round(lerp(outR, white.r, a));
        outG = Math.round(lerp(outG, white.g, a));
        outB = Math.round(lerp(outB, white.b, a));
      }

      setPixel(rgba, size, x, y, outR, outG, outB, outA);
    }
  }

  return rgba;
};

const main = () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const size of SIZES) {
    const rgba = drawIcon(size);
    const png = encodePng(size, size, rgba);
    fs.writeFileSync(path.join(OUT_DIR, `${size}.png`), png);
  }
  // 额外产出一个“默认尺寸”方便在 UI 里引用（避免写死 32/48）
  fs.copyFileSync(path.join(OUT_DIR, '128.png'), path.join(OUT_DIR, 'omnitab.png'));
  logger.info('generated', { outDir: OUT_DIR, sizes: SIZES });
};

main();
