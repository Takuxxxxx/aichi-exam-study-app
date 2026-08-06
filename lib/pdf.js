import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { WorkerMessageHandler } from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { readFile } from 'node:fs/promises';

globalThis.pdfjsWorker = { WorkerMessageHandler };

export async function extractPdfText(buffer) {
  const data = new Uint8Array(buffer);
  const loadingTask = getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;
  let text = '';
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let lastY = null;
      let pageText = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const y = item.transform?.[5] ?? 0;
        if (lastY !== null && Math.abs(y - lastY) > 1) pageText += '\n';
        pageText += item.str;
        lastY = y;
      }
      text += (pageText.trim() ? pageText.trim() + '\n\n' : '');
    }
  } finally {
    await loadingTask.destroy().catch(() => {});
  }
  if (!text.trim()) {
    throw new Error(
      'このPDFから文字を抽出できませんでした。スキャン画像PDFの可能性があります。' +
        'その場合は資料本文を「テキスト貼り付け」で登録してください。'
    );
  }
  return text;
}

export function readUploadedText(buffer) {
  return buffer.toString('utf8');
}
