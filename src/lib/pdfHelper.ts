import * as pdfjsLib from 'pdfjs-dist';

export const loadPdfDocument = (data: ArrayBuffer | Uint8Array) => {
  return pdfjsLib.getDocument({
    data,
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`,
  });
};
