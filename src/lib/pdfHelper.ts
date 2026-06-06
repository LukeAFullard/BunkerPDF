import * as pdfjsLib from 'pdfjs-dist';

export const loadPdfDocument = (data: ArrayBuffer | Uint8Array) => {
  return pdfjsLib.getDocument({
    data,
    cMapUrl: `${import.meta.env.BASE_URL}pdfjs-dist/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs-dist/standard_fonts/`,
    wasmUrl: `${import.meta.env.BASE_URL}pdfjs-dist/wasm/`,
  });
};
