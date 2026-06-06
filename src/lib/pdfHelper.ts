import * as pdfjsLib from 'pdfjs-dist';

export const loadPdfDocument = (data: ArrayBuffer | Uint8Array) => {
  return pdfjsLib.getDocument({
    data,
    cMapUrl: new URL(`${import.meta.env.BASE_URL}pdfjs-dist/cmaps/`, window.location.href).href,
    cMapPacked: true,
    standardFontDataUrl: new URL(`${import.meta.env.BASE_URL}pdfjs-dist/standard_fonts/`, window.location.href).href,
    wasmUrl: new URL(`${import.meta.env.BASE_URL}pdfjs-dist/wasm/`, window.location.href).href,
  });
};
