import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, "ascii");
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([size, typeBytes, data, crc]);
}

export function pngDimensionsFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("PNG inválido: assinatura ausente.");
  }
  if (buffer.toString("ascii", 12, 16) !== "IHDR") throw new Error("PNG inválido: IHDR ausente.");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export function pngDimensions(file) {
  return pngDimensionsFromBuffer(fs.readFileSync(file));
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodeRgbaPng(buffer) {
  pngDimensionsFromBuffer(buffer);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let compression = 0;
  let filterMethod = 0;
  let interlace = 0;
  const idat = [];

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) throw new Error("PNG inválido: chunk truncado.");
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      compression = data[10];
      filterMethod = data[11];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  if (!width || !height || !idat.length) throw new Error("PNG inválido: dados essenciais ausentes.");
  if (bitDepth !== 8 || colorType !== 6 || compression !== 0 || filterMethod !== 0 || interlace !== 0) {
    throw new Error(`PNG oficial incompatível com o gerador LG: depth=${bitDepth}, colorType=${colorType}, interlace=${interlace}.`);
  }

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  if (inflated.length !== height * (stride + 1)) throw new Error("PNG inválido: tamanho descomprimido inesperado.");

  const rgba = Buffer.alloc(width * height * bytesPerPixel);
  let sourceOffset = 0;
  let previous = null;

  for (let y = 0; y < height; y += 1) {
    const filterType = inflated[sourceOffset];
    sourceOffset += 1;
    const current = Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset + x];
      const a = x >= bytesPerPixel ? current[x - bytesPerPixel] : 0;
      const b = previous ? previous[x] : 0;
      const c = previous && x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      let value;
      if (filterType === 0) value = raw;
      else if (filterType === 1) value = raw + a;
      else if (filterType === 2) value = raw + b;
      else if (filterType === 3) value = raw + Math.floor((a + b) / 2);
      else if (filterType === 4) value = raw + paeth(a, b, c);
      else throw new Error(`PNG inválido: filtro ${filterType} não suportado.`);
      current[x] = value & 0xff;
    }
    current.copy(rgba, y * stride);
    previous = current;
    sourceOffset += stride;
  }

  return { width, height, rgba };
}

function resizeBilinear({ width, height, rgba }, targetWidth, targetHeight) {
  const output = Buffer.alloc(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y += 1) {
    const sy = Math.max(0, Math.min(height - 1, ((y + 0.5) * height / targetHeight) - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(height - 1, y0 + 1);
    const wy = sy - y0;
    for (let x = 0; x < targetWidth; x += 1) {
      const sx = Math.max(0, Math.min(width - 1, ((x + 0.5) * width / targetWidth) - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(width - 1, x0 + 1);
      const wx = sx - x0;
      const outIndex = (y * targetWidth + x) * 4;
      const i00 = (y0 * width + x0) * 4;
      const i10 = (y0 * width + x1) * 4;
      const i01 = (y1 * width + x0) * 4;
      const i11 = (y1 * width + x1) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const top = rgba[i00 + channel] * (1 - wx) + rgba[i10 + channel] * wx;
        const bottom = rgba[i01 + channel] * (1 - wx) + rgba[i11 + channel] * wx;
        output[outIndex + channel] = Math.max(0, Math.min(255, Math.round(top * (1 - wy) + bottom * wy)));
      }
    }
  }
  return output;
}

function encodeRgbaPng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND")
  ]);
}

export function resizePngFile(inputFile, outputFile, width, height = width) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`Dimensão PNG inválida: ${width}x${height}.`);
  }
  const decoded = decodeRgbaPng(fs.readFileSync(inputFile));
  const resized = resizeBilinear(decoded, width, height);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, encodeRgbaPng(width, height, resized));
  return outputFile;
}
