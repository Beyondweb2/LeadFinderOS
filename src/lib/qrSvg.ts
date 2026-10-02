/* QR CODE AS INLINE SVG — for the Welcome Pack's agreement link (Paul, 2026-10-02).
   Pure string output, no DOM and no network, so it renders identically in the browser pack, the
   server pack (Deno) and print. Error correction M; one dark path, so it is crisp at any size.
   ⚠️ EXPLICIT .ts ON EVERY RELATIVE IMPORT — reached from edge functions. */
import qrcodeUntyped from './vendor/qrcodeGenerator.ts';

/** The four calls this file makes on the vendored (untyped) generator. */
interface QrCode { addData(data: string, mode?: string): void; make(): void; getModuleCount(): number; isDark(row: number, col: number): boolean }
const qrcode = qrcodeUntyped as unknown as (typeNumber: number, errorCorrection: 'L' | 'M' | 'Q' | 'H') => QrCode;

export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** An SVG of `text`, `size` px square, with the standard four-module quiet zone. */
export function qrSvg(text: string, size = 132, label = 'QR code'): string {
  const m = qrModules(text);
  const n = m.length; const q = 4; const total = n + q * 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) d += `M${c + q} ${r + q}h1v1h-1z`;
  const safe = label.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" role="img" aria-label="${safe}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
