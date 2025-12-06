const fs = require('fs');
const path = require('path');

// Simple PNG generator - creates a solid color icon with basic shape
// This uses raw PNG encoding without external dependencies

function createPNG(width, height) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = createIHDRChunk(width, height);

  // IDAT chunk (image data)
  const idat = createIDATChunk(width, height);

  // IEND chunk
  const iend = createIENDChunk();

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createIHDRChunk(width, height) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data.writeUInt8(8, 8);  // bit depth
  data.writeUInt8(6, 9);  // color type (RGBA)
  data.writeUInt8(0, 10); // compression
  data.writeUInt8(0, 11); // filter
  data.writeUInt8(0, 12); // interlace

  return createChunk('IHDR', data);
}

function createIDATChunk(width, height) {
  const zlib = require('zlib');

  // Create raw pixel data with purple background and play icon
  const rawData = [];
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.35;

  for (let y = 0; y < height; y++) {
    rawData.push(0); // Filter byte for each row
    for (let x = 0; x < width; x++) {
      // Background color (purple #7B68EE)
      let r = 123, g = 104, b = 238, a = 255;

      // Calculate distance from center for rounded corners
      const cornerRadius = width * 0.15;
      const inCorner = isInRoundedRect(x, y, width, height, cornerRadius);

      if (!inCorner) {
        a = 0; // Transparent outside rounded rect
      } else {
        // Draw a simple play triangle in the center
        const triSize = width * 0.25;
        const triX = centerX - triSize * 0.3;
        const triY1 = centerY - triSize;
        const triY2 = centerY + triSize;

        // Check if point is inside play triangle
        if (isInTriangle(x, y, triX, triY1, triX, triY2, triX + triSize * 1.2, centerY)) {
          r = 26; g = 26; b = 46; // Dark color for play button
        }

        // Draw download arrow below
        const arrowY = centerY + triSize * 0.7;
        const arrowWidth = width * 0.15;
        const arrowHeight = width * 0.12;

        // Arrow stem
        if (Math.abs(x - centerX) < arrowWidth * 0.3 &&
            y > arrowY && y < arrowY + arrowHeight) {
          r = 255; g = 255; b = 255;
        }

        // Arrow head
        const headY = arrowY + arrowHeight;
        if (y >= headY && y < headY + arrowWidth * 0.5) {
          const dist = Math.abs(x - centerX);
          const maxDist = arrowWidth * (1 - (y - headY) / (arrowWidth * 0.5));
          if (dist < maxDist) {
            r = 255; g = 255; b = 255;
          }
        }
      }

      rawData.push(r, g, b, a);
    }
  }

  const compressed = zlib.deflateSync(Buffer.from(rawData));
  return createChunk('IDAT', compressed);
}

function isInRoundedRect(x, y, width, height, radius) {
  // Check corners
  if (x < radius && y < radius) {
    return Math.sqrt((x - radius) ** 2 + (y - radius) ** 2) <= radius;
  }
  if (x >= width - radius && y < radius) {
    return Math.sqrt((x - (width - radius)) ** 2 + (y - radius) ** 2) <= radius;
  }
  if (x < radius && y >= height - radius) {
    return Math.sqrt((x - radius) ** 2 + (y - (height - radius)) ** 2) <= radius;
  }
  if (x >= width - radius && y >= height - radius) {
    return Math.sqrt((x - (width - radius)) ** 2 + (y - (height - radius)) ** 2) <= radius;
  }
  return true;
}

function isInTriangle(px, py, x1, y1, x2, y2, x3, y3) {
  const area = 0.5 * (-y2 * x3 + y1 * (-x2 + x3) + x1 * (y2 - y3) + x2 * y3);
  const s = 1 / (2 * area) * (y1 * x3 - x1 * y3 + (y3 - y1) * px + (x1 - x3) * py);
  const t = 1 / (2 * area) * (x1 * y2 - y1 * x2 + (y1 - y2) * px + (x2 - x1) * py);
  return s >= 0 && t >= 0 && (1 - s - t) >= 0;
}

function createIENDChunk() {
  return createChunk('IEND', Buffer.alloc(0));
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuffer, data]));

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 implementation
function crc32(buffer) {
  let crc = 0xffffffff;
  const table = makeCRCTable();

  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xff];
  }

  return crc ^ 0xffffffff;
}

function makeCRCTable() {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = ((c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1));
    }
    table[n] = c;
  }
  return table;
}

// Generate icons
const sizes = [16, 48, 128];
const iconsDir = path.join(__dirname, 'extension', 'icons');

sizes.forEach(size => {
  const png = createPNG(size, size);
  const filename = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filename, png);
  console.log(`Created ${filename}`);
});

console.log('Icons generated successfully!');
