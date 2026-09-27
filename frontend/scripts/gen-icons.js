// Gera os PNGs do PWA a partir dos SVGs da marca (rodar: node scripts/gen-icons.js)
const sharp = require('sharp');
const path = require('path');

const dir = path.join(__dirname, '..', 'src', 'assets', 'icons');
const any = path.join(dir, 'icon.svg');
const maskable = path.join(dir, 'icon-maskable.svg');

const jobs = [
  { src: any, size: 192, out: 'icon-192.png' },
  { src: any, size: 512, out: 'icon-512.png' },
  { src: maskable, size: 192, out: 'icon-maskable-192.png' },
  { src: maskable, size: 512, out: 'icon-maskable-512.png' },
  { src: any, size: 180, out: 'apple-touch-icon.png' }, // iOS
];

(async () => {
  for (const j of jobs) {
    await sharp(j.src, { density: 384 })
      .resize(j.size, j.size)
      .png()
      .toFile(path.join(dir, j.out));
    console.log('✓', j.out, `(${j.size}px)`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
