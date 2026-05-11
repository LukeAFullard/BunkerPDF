import { get, set, del } from 'idb-keyval';
import type { PDFDocument } from '../store/fileStore';

const SESSION_KEY = 'bunkerpdf_session_v1';

export async function saveSession(documents: PDFDocument[], activeId: string | null) {
  try {
    const sessionData = documents.map((doc) => {
        return {
          id: doc.id,
          name: doc.name,
          size: doc.size,
          pageCount: doc.pageCount,
          lastModified: doc.lastModified,
          isEncrypted: doc.isEncrypted,
          isCorrupt: doc.isCorrupt,
          file: doc.file, // idb-keyval supports structured clone natively
        };
      });
    await set(SESSION_KEY, { documents: sessionData, activeId });
  } catch (error) {
    console.error('Failed to save session:', error);
  }
}

export async function loadSession(): Promise<{ documents: PDFDocument[]; activeId: string | null } | null> {
  try {
    const sessionData = await get(SESSION_KEY);
    if (!sessionData) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docs = sessionData.documents.map((docData: any) => {
      return {
        id: docData.id,
        file: docData.file,
        name: docData.name,
        size: docData.size,
        pageCount: docData.pageCount,
        lastModified: docData.lastModified,
        isEncrypted: docData.isEncrypted,
        isCorrupt: docData.isCorrupt,
        history: { past: [], future: [] }, // History isn't persisted to save space
      };
    });

    return { documents: docs, activeId: sessionData.activeId };
  } catch (error) {
    console.error('Failed to load session:', error);
    return null;
  }
}

export async function clearSession() {
  try {
    await del(SESSION_KEY);
  } catch (error) {
    console.error('Failed to clear session:', error);
  }
}
