/* eslint-disable @typescript-eslint/no-explicit-any */
import { pipeline, env } from '@huggingface/transformers';

// Suppress local file warnings in browser
env.allowLocalModels = false;

let nerPipeline: any = null;

// Messages
export type NERWorkerMessage = {
  customRegexes?: string[];
  type: 'INIT' | 'EXTRACT';
  text?: string;
  jobId?: string;
};

export type NERWorkerResponse = {
  type: 'READY' | 'RESULT' | 'ERROR';
  jobId?: string;
  result?: string[]; // Return a list of unique strings
  error?: string;
};

// Simple regex fallbacks for common PII
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;

self.onmessage = async (e: MessageEvent<NERWorkerMessage>) => {
  const { type, text, jobId, customRegexes } = e.data;

  try {
    if (type === 'INIT') {
      if (!nerPipeline) {
        nerPipeline = await pipeline('token-classification', 'Xenova/bert-base-NER', {
          quantized: true,
        } as any);
      }
      self.postMessage({ type: 'READY', jobId } satisfies NERWorkerResponse);
    } else if (type === 'EXTRACT') {
      if (!nerPipeline) throw new Error('Pipeline not initialized');
      if (!text) throw new Error('No text provided for extraction');

      const extractedItems = new Set<string>();

      // 1. Run Regex Extractors
      const emails = text.match(EMAIL_REGEX) || [];
      emails.forEach(e => extractedItems.add(e));

      const ssns = text.match(SSN_REGEX) || [];
      ssns.forEach(s => extractedItems.add(s));

      if (customRegexes) {
        customRegexes.forEach(pattern => {
          try {
            const regex = new RegExp(pattern, 'g');
            const matches = text.match(regex) || [];
            matches.forEach(m => extractedItems.add(m));
          } catch (err) {
            console.warn("Invalid custom regex pattern:", pattern);
          }
        });
      }

      // 2. Run NER Model
      // Using simple aggregation to group words like "Jane" and "Doe" into "Jane Doe"
      const nerResults = await nerPipeline(text, { aggregation_strategy: 'simple' });

      // Filter for people, organizations, and locations
      const validGroups = ['PER', 'ORG', 'LOC'];
      for (const res of nerResults) {
        if (validGroups.includes(res.entity_group) && res.score > 0.8) {
          extractedItems.add(res.word.trim());
        }
      }

      self.postMessage({
        type: 'RESULT',
        jobId,
        result: Array.from(extractedItems)
      } satisfies NERWorkerResponse);
    }
  } catch (error: any) {
    self.postMessage({ type: 'ERROR', jobId, error: error.message } satisfies NERWorkerResponse);
  }
};
