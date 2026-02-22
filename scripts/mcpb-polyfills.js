// Polyfills pour le bundle MCPB (Desktop Extension)
//
// 1. createRequire : nécessaire pour les dépendances CJS (iconv-lite, safer-buffer)
//    qui utilisent require() dynamique sur des modules Node.js natifs
//
// 2. DOMMatrix/Path2D/ImageData : pdfjs-dist tente de les utiliser au chargement
//    pour le rendu canvas (dont on n'a pas besoin — extraction texte uniquement)
//
// 3. pdfjsWorker : pdfjs-dist cherche globalThis.pdfjsWorker.WorkerMessageHandler
//    pour tourner en mode "fake worker" (même thread, sans Worker séparé).
//    Sans ça, il lance "No GlobalWorkerOptions.workerSrc specified".

import { createRequire } from "module";
globalThis.require = createRequire(import.meta.url);

if (!globalThis.DOMMatrix) {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() {
      this.a = 1; this.b = 0; this.c = 0;
      this.d = 1; this.e = 0; this.f = 0;
    }
  };
}
if (!globalThis.Path2D) {
  globalThis.Path2D = class Path2D {};
}
if (!globalThis.ImageData) {
  globalThis.ImageData = class ImageData {
    constructor(w, h) {
      this.width = w;
      this.height = h;
      this.data = new Uint8ClampedArray(w * h * 4);
    }
  };
}

// Charger le worker pdfjs-dist dans le même thread (pas de Worker séparé dans un bundle)
import { WorkerMessageHandler } from "pdfjs-dist/legacy/build/pdf.worker.mjs";
globalThis.pdfjsWorker = { WorkerMessageHandler };
