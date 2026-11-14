// On-device OCR. Browser only: Tesseract.js runs in its own web worker, and every asset
// (worker script, WASM core, English data) is served from /tesseract on our origin.
// Document images and text never leave the browser here.
import { createWorker, type Worker } from 'tesseract.js';

export type OcrProgress = { status: string; progress: number }; // progress 0..1 for the current step

const ASSETS = {
  workerPath: '/tesseract/worker.min.js',
  corePath: '/tesseract/core',
  langPath: '/tesseract/lang',
};

/** Reads the text from each image in order, reusing one worker. */
export async function ocrImages(images: File[], onProgress?: (p: OcrProgress & { index: number }) => void): Promise<string[]> {
  let index = 0;
  const worker: Worker = await createWorker('eng', 1, {
    ...ASSETS,
    logger: (m) => onProgress?.({ index, status: m.status, progress: m.progress }),
  });
  try {
    const texts: string[] = [];
    for (const image of images) {
      const { data } = await worker.recognize(image);
      texts.push(data.text);
      index++;
    }
    return texts;
  } finally {
    await worker.terminate();
  }
}
