import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedH2c: string = '';

export function getHtml2CanvasJs(): string {
  if (cachedH2c) return cachedH2c;
  try {
    const p = path.resolve(__dirname, '../../node_modules/html2canvas/dist/html2canvas.min.js');
    if (fs.existsSync(p)) {
      cachedH2c = fs.readFileSync(p, 'utf-8');
      return cachedH2c;
    }
  } catch {}
  return '';
}
