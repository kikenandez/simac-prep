// lib/files.js — extraction de texte depuis des fichiers déposés (plaquette, mail, texte), dans le navigateur.
// PDF via pdf.js, Word via mammoth — chargés à la demande depuis cdnjs (gratuit), rien n'est envoyé à un serveur.

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.worker.min.mjs';
const MAMMOTH = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js';
const MAX_CHARS = 8000;

export const ACCEPT = '.pdf,.docx,.txt,.md,.eml,.csv,.json,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function extractText(file) {
  const name = file.name.toLowerCase();
  let text;
  if (name.endsWith('.pdf') || file.type === 'application/pdf') text = await fromPdf(file);
  else if (name.endsWith('.docx')) text = await fromDocx(file);
  else text = await file.text();
  text = String(text || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new Error(`Aucun texte lisible dans ${file.name} (scan sans OCR ?).`);
  return { source: file.name, kind: 'document', text: text.slice(0, MAX_CHARS), truncated: text.length > MAX_CHARS };
}

async function fromPdf(file) {
  const pdfjs = await import(PDFJS);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => it.str).join(' '));
  }
  return pages.join('\n\n');
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
