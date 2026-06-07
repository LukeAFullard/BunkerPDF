import * as pdfjsLib from 'pdfjs-dist';

export const loadPdfDocument = (data: ArrayBuffer | Uint8Array) => {
  return pdfjsLib.getDocument({
    data,
    cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`,
    wasmUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/wasm/`,
  });
};
