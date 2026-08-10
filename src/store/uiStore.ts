import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ComplexityMode = 'simple' | 'enhanced' | 'professional';

interface UIState {
  complexityMode: ComplexityMode;
  setComplexityMode: (mode: ComplexityMode) => void;
  activeTool: string | null;
  setActiveTool: (tool: string | null) => void;
  feedbackPrompt: {
    isOpen: boolean;
    toolName: string;
  };
  showFeedbackPrompt: (toolName: string) => void;
  hideFeedbackPrompt: () => void;
  extractionMethod: 'pyodide' | 'liteparse';
  setExtractionMethod: (method: 'pyodide' | 'liteparse') => void;
  liteparseOcrEnabled: boolean;
  setLiteparseOcrEnabled: (enabled: boolean) => void;
  enableLineTracing: boolean;
  spanningLabelOverflowFactor: number;
  setSpanningLabelOverflowFactor: (v: number) => void;
  spanWidthFractionRow: number;
  enableStyledSpanningLabel: boolean;
  setEnableStyledSpanningLabel: (enabled: boolean) => void;
  setSpanWidthFractionRow: (v: number) => void;
  setEnableLineTracing: (enabled: boolean) => void;
  tier2Enabled: boolean;
  setTier2Enabled: (enabled: boolean) => void;
  confidenceThreshold: number;
  setConfidenceThreshold: (threshold: number) => void;
  removeWatermarks: boolean;
  setRemoveWatermarks: (enabled: boolean) => void;
  handwritingModelPrecision: 'q8' | 'fp16' | 'fp32';
  setHandwritingModelPrecision: (precision: 'q8' | 'fp16' | 'fp32') => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
  complexityMode: 'professional',
  setComplexityMode: (mode) => set({ complexityMode: mode }),
  activeTool: null,
  setActiveTool: (tool) => set({ activeTool: tool }),
  feedbackPrompt: { isOpen: false, toolName: '' },
  showFeedbackPrompt: (toolName) => set({ feedbackPrompt: { isOpen: true, toolName } }),
  hideFeedbackPrompt: () => set({ feedbackPrompt: { isOpen: false, toolName: '' } }),
  extractionMethod: 'liteparse',
  setExtractionMethod: (method) => set({ extractionMethod: method }),
  liteparseOcrEnabled: false,
  setLiteparseOcrEnabled: (enabled) => set({ liteparseOcrEnabled: enabled }),
  enableLineTracing: true,
  spanningLabelOverflowFactor: 1.75,
  setSpanningLabelOverflowFactor: (v) => set({ spanningLabelOverflowFactor: v }),
  spanWidthFractionRow: 0.6,
  enableStyledSpanningLabel: false,
  setEnableStyledSpanningLabel: (enabled) => set({ enableStyledSpanningLabel: enabled }),
  setSpanWidthFractionRow: (v) => set({ spanWidthFractionRow: v }),
  setEnableLineTracing: (enabled) => set({ enableLineTracing: enabled }),
  tier2Enabled: true,
  setTier2Enabled: (enabled) => set({ tier2Enabled: enabled }),
  confidenceThreshold: 0.6,
  setConfidenceThreshold: (threshold) => set({ confidenceThreshold: threshold }),
  removeWatermarks: false,
  setRemoveWatermarks: (enabled) => set({ removeWatermarks: enabled }),
  handwritingModelPrecision: 'fp16',
  setHandwritingModelPrecision: (precision) => set({ handwritingModelPrecision: precision }),
    }),
    {
      name: 'bunkerpdf-ui-storage',
      partialize: (state) => ({
        complexityMode: state.complexityMode,
        extractionMethod: state.extractionMethod,
        liteparseOcrEnabled: state.liteparseOcrEnabled,
        enableLineTracing: state.enableLineTracing,
        spanningLabelOverflowFactor: state.spanningLabelOverflowFactor,
        spanWidthFractionRow: state.spanWidthFractionRow,
        enableStyledSpanningLabel: state.enableStyledSpanningLabel,
        tier2Enabled: state.tier2Enabled,
        confidenceThreshold: state.confidenceThreshold,
        removeWatermarks: state.removeWatermarks,
        handwritingModelPrecision: state.handwritingModelPrecision,
      }),
    }
  )
);
