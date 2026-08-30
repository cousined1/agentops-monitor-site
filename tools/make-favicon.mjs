// One-off favicon generator: 32x32 dark tile (#0e1116) with 3 green bars (#56d364)
// ESM variant (repo has "type": "module"): use import + fileURLToPath, not require/__dirname
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const size = 32;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#0e1116"/>
  <rect x="7"  y="16" width="4" height="9"  rx="1" fill="#56d364"/>
  <rect x="14" y="10" width="4" height="15" rx="1" fill="#56d364"/>
  <rect x="21" y="5"  width="4" height="20" rx="1" fill="#56d364"/>
</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  // Minimal ICO wrapper for a single PNG image
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type: icon
  header.writeUInt16LE(1, 4);      // count
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0); // width
  entry.writeUInt8(size === 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2);          // palette
  entry.writeUInt8(0, 3);          // reserved
  entry.writeUInt16LE(1, 4);       // planes
  entry.writeUInt16LE(32, 6);      // bpp
  entry.writeUInt32LE(png.length, 8);       // image size
  entry.writeUInt32LE(6 + 16, 12);          // offset
  const ico = Buffer.concat([header, entry, png]);
  const out = path.join(__dirname, '..', 'public', 'favicon.ico');
  fs.writeFileSync(out, ico);
  console.log('wrote', out, ico.length, 'bytes');
}

main().catch(e => { console.error(e); process.exit(1); });
