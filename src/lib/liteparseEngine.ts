import init, { LiteParse } from "@llamaindex/liteparse-wasm";

let engineInstance: LiteParse | null = null;
let initPromise: Promise<LiteParse> | null = null;

export const initLiteParse = async (): Promise<LiteParse> => {
  if (engineInstance) return engineInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await init();
      const engine = new LiteParse({});
      engineInstance = engine;
      return engine;
    } catch (error) {
      console.error("Failed to initialize LiteParse:", error);
      throw error;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
};

export const extractTextLiteparse = async (bytes: Uint8Array): Promise<string> => {
  const engine = await initLiteParse();
  const result = await engine.parse(bytes);
  return result.text || "";
};
