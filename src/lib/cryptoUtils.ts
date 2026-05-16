export async function hashDocument(fileBytes: Uint8Array): Promise<string> {
  const standardBuffer = new Uint8Array(fileBytes.length);
  standardBuffer.set(fileBytes);
  const hashBuffer = await crypto.subtle.digest('SHA-256', standardBuffer.buffer as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export interface IntegrityCertificate {
  tool: string;
  version: string;
  filename: string;
  filesize_bytes: number;
  sha256: string;
  timestamp_utc: string;
  note: string;
}

export function generateIntegrityCertificate(
  filename: string,
  filesizeBytes: number,
  sha256: string
): IntegrityCertificate {
  return {
    tool: "BunkerPDF",
    version: "1.x.x",
    filename,
    filesize_bytes: filesizeBytes,
    sha256,
    timestamp_utc: new Date().toISOString(),
    note: "Hash generated entirely in-browser. No data was transmitted."
  };
}

export function downloadCertificateJson(certificate: IntegrityCertificate) {
  const blob = new Blob([JSON.stringify(certificate, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${certificate.filename}-certificate.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCertificateTxt(certificate: IntegrityCertificate) {
  const txtContent = `BunkerPDF Integrity Certificate\n\nFilename: ${certificate.filename}\nSize (bytes): ${certificate.filesize_bytes}\nSHA-256 Hash: ${certificate.sha256}\nTimestamp (UTC): ${certificate.timestamp_utc}\n\n${certificate.note}`;
  const blob = new Blob([txtContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${certificate.filename}-certificate.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
