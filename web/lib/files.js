// lib/files.js — extraction de texte depuis des fichiers déposés (plaquette, mail, texte), dans le navigateur.
// PDF via pdf.js, Word via mammoth, images et PDF scannés via tesseract.js (OCR dans le navigateur) —
// chargés à la demande depuis cdnjs (gratuit), rien n'est envoyé à un serveur.

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.worker.min.mjs';
const MAMMOTH = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js';
const TESSERACT = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js';
const MAX_CHARS = 8000;
const OCR_MAX_PAGES = 4; // un flyer, une plaquette courte ; au-delà, c'est long dans le navigateur

export const ACCEPT = '.pdf,.docx,.txt,.md,.eml,.csv,.json,.png,.jpg,.jpeg,.webp,text/plain,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** @param {(msg:string)=>void} [onProgress] — informe l'utilisateur quand l'OCR démarre (lent la première fois : modèle de langue téléchargé). */
export async function extractText(file, onProgress = () => {}) {
  const name = file.name.toLowerCase();
  let text; let ocr = false;
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    text = await fromPdf(file);
    if (!clean(text)) { onProgress(`${file.name} : PDF sans texte — lecture optique en cours (quelques dizaines de secondes)…`); text = await ocrPdf(file); ocr = true; }
  } else if (/\.(png|jpe?g|webp)$/.test(name) || /^image\//.test(file.type)) {
    onProgress(`${file.name} : lecture optique de l’image (quelques dizaines de secondes)…`); text = await ocrImage(file); ocr = true;
  } else if (name.endsWith('.docx')) text = await fromDocx(file);
  else text = await file.text();
  text = clean(text);
  if (!text) throw new Error(`Aucun texte lisible dans ${file.name}${ocr ? ' (image trop petite ou illisible)' : ''}.`);
  return { source: file.name, kind: 'document', text: text.slice(0, MAX_CHARS), truncated: text.length > MAX_CHARS, ocr };
}

const clean = (t) => String(t || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

async function pdfjs() { const m = await import(PDFJS); m.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return m; }

async function fromPdf(file) {
  const doc = await (await pdfjs()).getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => it.str).join(' '));
  }
  return pages.join('\n\n');
}

// --- OCR (tesseract.js, français + anglais), tout dans le navigateur ---
async function tesseract() {
  if (!window.Tesseract) {
    await new Promise((resolve, reject) => {
      const sc = document.createElement('script'); sc.src = TESSERACT; sc.onload = resolve; sc.onerror = () => reject(new Error('Chargement de tesseract.js impossible.'));
      document.head.appendChild(sc);
    });
  }
  return window.Tesseract;
}
async function ocrCanvasList(canvases) {
  const T = await tesseract();
  const worker = await T.createWorker('fra+eng');
  try {
    const out = [];
    for (const c of canvases) { const { data } = await worker.recognize(c); out.push(data.text); }
    return out.join('\n\n');
  } finally { await worker.terminate(); }
}
async function ocrImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Image illisible.')); i.src = url; });
    const scale = Math.min(2, Math.max(1, 1800 / Math.max(img.width, img.height)));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return ocrCanvasList([c]);
  } finally { URL.revokeObjectURL(url); }
}
async function ocrPdf(file) {
  const doc = await (await pdfjs()).getDocument({ data: await file.arrayBuffer() }).promise;
  const canvases = [];
  for (let i = 1; i <= Math.min(doc.numPages, OCR_MAX_PAGES); i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const c = document.createElement('canvas'); c.width = viewport.width; c.height = viewport.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport }).promise;
    canvases.push(c);
  }
  return ocrCanvasList(canvases);
}

async function fromDocx(file) {
  if (!window.mammoth) {
    await new Promise((resolve, reject) => {
      const sc = document.createElement('script'); sc.src = MAMMOTH; sc.onload = resolve; sc.onerror = () => reject(new Error('Chargement de mammoth impossible.'));
      document.head.appendChild(sc);
    });
  }
  const r = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return r.value;
}
