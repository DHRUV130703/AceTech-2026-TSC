/**
 * Generates the AceTech 2026 booth QR code.
 *
 * Usage:
 *   npm run qr -- https://your-domain.com
 *   QR_URL=https://your-domain.com npm run qr
 *
 * Outputs (public/qr/):
 *   acetech-qr.svg          – plain QR, vector, for print / designers
 *   acetech-qr.png          – plain QR, 1024px, for slides / quick use
 *   acetech-qr-poster.svg   – branded booth standee (A5 ratio, vector)
 *
 * The `?src=acetech-qr` tag is appended so QR traffic is attributable.
 * Navy on white only — aqua modules are too low-contrast to scan reliably.
 */
import QRCode from 'qrcode';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const NAVY = '#1F2A4C';
const NAVY_800 = '#253050';
const AQUA_300 = '#A3CCDA';
const AQUA_200 = '#BBD7DC';
const AQUA_50 = '#EAF3F5';

const PLACEHOLDER_URL = 'https://example.com';

const rawUrl = process.argv[2] ?? process.env.QR_URL ?? PLACEHOLDER_URL;
const isPlaceholder = rawUrl === PLACEHOLDER_URL;

const target = new URL(rawUrl);
if (!target.searchParams.has('src')) target.searchParams.set('src', 'acetech-qr');
const url = target.toString();

const outDir = path.resolve('public/qr');
await mkdir(outDir, { recursive: true });

// Level H: survives glare, smudges and partial occlusion at a busy booth.
const qrOpts = {
  errorCorrectionLevel: 'H' as const,
  margin: 4, // quiet zone in modules
  color: { dark: `${NAVY}FF`, light: '#FFFFFFFF' },
};

const qrSvg = await QRCode.toString(url, { ...qrOpts, type: 'svg' });
await writeFile(path.join(outDir, 'acetech-qr.svg'), qrSvg);
await QRCode.toFile(path.join(outDir, 'acetech-qr.png'), url, { ...qrOpts, width: 1024 });

// ---------- Branded poster (A5 ratio: 1240 × 1748) ----------
const W = 1240;
const H = 1748;
const QR_SIZE = 640;
const QR_X = (W - QR_SIZE) / 2;
const QR_Y = 640;

// Nest the QR <svg> at a fixed position/size inside the poster.
const nestedQr = qrSvg
  .replace(/<\?xml[^>]*>/, '')
  .replace('<svg ', `<svg x="${QR_X}" y="${QR_Y}" width="${QR_SIZE}" height="${QR_SIZE}" `);

const font = `'Montserrat', 'Helvetica Neue', Arial, sans-serif`;

const poster = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${AQUA_200}"/>
      <stop offset="1" stop-color="${AQUA_50}"/>
    </linearGradient>
    <!-- SmartGRID motif -->
    <pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse">
      <rect width="36" height="36" fill="none" stroke="${AQUA_300}" stroke-width="5"/>
    </pattern>
    <linearGradient id="gridFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="1"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="fade"><rect y="180" width="${W}" height="420" fill="url(#gridFade)"/></mask>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="${NAVY}" flood-opacity="0.18"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect y="180" width="${W}" height="420" fill="url(#grid)" mask="url(#fade)" opacity="0.7"/>

  <!-- Header band. TODO(brand): replace wordmark text with official logo SVG. -->
  <rect width="${W}" height="180" fill="${NAVY}"/>
  <g transform="translate(${W / 2 - 230} 50)">
    <rect x="0" y="6" width="52" height="52" fill="none" stroke="#fff" stroke-width="7"/>
    <rect x="22" y="28" width="52" height="52" fill="none" stroke="#fff" stroke-width="7"/>
    <text x="104" y="40" font-family="${font}" font-weight="800" font-size="44" fill="#fff" letter-spacing="2">THE SLEEP</text>
    <text x="104" y="86" font-family="${font}" font-weight="800" font-size="44" fill="#fff" letter-spacing="2">COMPANY</text>
  </g>

  <!-- Headline -->
  <text x="${W / 2}" y="300" text-anchor="middle" font-family="${font}" font-weight="800" font-size="34" fill="${NAVY}" letter-spacing="8">ACETECH 2026</text>
  <text x="${W / 2}" y="420" text-anchor="middle" font-family="${font}" font-weight="800" font-size="84" fill="${NAVY}" letter-spacing="2">SCAN TO CONNECT</text>
  <text x="${W / 2}" y="500" text-anchor="middle" font-family="${font}" font-weight="500" font-size="34" fill="${NAVY_800}">Share your details and our Sleep Experts</text>
  <text x="${W / 2}" y="548" text-anchor="middle" font-family="${font}" font-weight="500" font-size="34" fill="${NAVY_800}">will get in touch with you.</text>

  <!-- QR card -->
  <rect x="${QR_X - 60}" y="${QR_Y - 60}" width="${QR_SIZE + 120}" height="${QR_SIZE + 120}" rx="36" fill="#fff" filter="url(#shadow)"/>
  ${nestedQr}

  <text x="${W / 2}" y="${QR_Y + QR_SIZE + 140}" text-anchor="middle" font-family="${font}" font-weight="600" font-size="30" fill="${NAVY}">Point your phone camera here</text>
  ${
    isPlaceholder
      ? `<text x="${W / 2}" y="${QR_Y + QR_SIZE + 190}" text-anchor="middle" font-family="${font}" font-weight="800" font-size="30" fill="#B42318">PREVIEW ONLY — PLACEHOLDER URL, DO NOT PRINT</text>`
      : ''
  }

  <!-- Footer -->
  <rect y="${H - 150}" width="${W}" height="150" fill="${NAVY}"/>
  <text x="${W / 2}" y="${H - 88}" text-anchor="middle" font-family="${font}" font-weight="700" font-size="28" fill="#fff" letter-spacing="3">MATTRESS | CHAIR | RECLINER BED | RECLINER SOFA | PILLOW</text>
  <text x="${W / 2}" y="${H - 40}" text-anchor="middle" font-family="${font}" font-weight="500" font-size="24" fill="${AQUA_200}">thesleepcompany.in  ·  +91 98119 81911</text>
</svg>
`;

await writeFile(path.join(outDir, 'acetech-qr-poster.svg'), poster);

console.log(`QR encodes: ${url}`);
console.log(`Written to: ${path.relative(process.cwd(), outDir)}/`);
if (isPlaceholder) {
  console.warn('\n⚠️  No URL given — generated a PREVIEW with a placeholder URL. Do not print.');
  console.warn('   Re-run with: npm run qr -- https://<final-domain>\n');
}
