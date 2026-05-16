import { AlertCircle, CheckCircle, FileSearch, Lock, Zap } from 'lucide-react';
import type { PDFDocument } from '../../store/fileStore';

interface HealthCheck {
  id: string;
  status: 'good' | 'warning' | 'action';
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface DocumentHealthPanelProps {
  doc: PDFDocument;
  healthData?: { needsOcr: boolean; hasSelectableText: boolean; hasForms: boolean } | null;
  onOcr: () => void;
  onUnlock: () => void;
  onSanitize: () => void;
  onOptimize: () => void;
}

export function DocumentHealthPanel({
  doc,
  healthData,
  onOcr,
  onUnlock,
  onSanitize,
  onOptimize
}: DocumentHealthPanelProps) {
  const checks: HealthCheck[] = [];

  // Check 1: Encryption status
  if (doc.isEncrypted) {
    checks.push({
      id: 'encrypted',
      status: 'warning',
      icon: <Lock className="w-5 h-5" />,
      title: 'Password Protected',
      description: 'This document is encrypted. Some features may not work.',
      action: {
        label: 'Unlock Document',
        onClick: onUnlock
      }
    });
  }

  // Check 2: File size optimization
  if (doc.size > 10 * 1024 * 1024) { // > 10MB
    checks.push({
      id: 'large',
      status: 'action',
      icon: <Zap className="w-5 h-5" />,
      title: 'Large File Size',
      description: `${(doc.size / 1024 / 1024).toFixed(1)}MB - Consider optimizing to reduce size.`,
      action: {
        label: 'Optimize',
        onClick: onOptimize
      }
    });
  }

  // Check 3: Needs OCR
  if (healthData?.needsOcr) {
    checks.push({
      id: 'ocr',
      status: 'action',
      icon: <FileSearch className="w-5 h-5" />,
      title: 'Scanned Document Detected',
      description: 'No selectable text found. Run OCR to make it searchable.',
      action: {
        label: 'Run OCR',
        onClick: onOcr
      }
    });
  }

  // Check 4: Metadata present
  checks.push({
    id: 'metadata',
    status: 'action',
    icon: <AlertCircle className="w-5 h-5" />,
    title: 'Contains Metadata',
    description: 'Remove author, creation date, and other hidden information.',
    action: {
      label: 'Sanitize',
      onClick: onSanitize
    }
  });

  // Show "All Good" if no issues
  if (checks.length === 0) {
    checks.push({
      id: 'healthy',
      status: 'good',
      icon: <CheckCircle className="w-5 h-5" />,
      title: 'Document Looks Good',
      description: 'No issues detected. Use the context menu to perform actions.'
    });
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 rounded-xl p-4 border border-blue-100 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        Document Health
      </h3>
      <div className="space-y-2">
        {checks.map((check) => (
          <div
            key={check.id}
            className={`bg-white dark:bg-gray-800 rounded-lg p-3 border ${
              check.status === 'good' ? 'border-green-200 dark:border-green-900' :
              check.status === 'warning' ? 'border-orange-200 dark:border-orange-900' :
              'border-blue-200 dark:border-blue-900'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${
                check.status === 'good' ? 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300' :
                check.status === 'warning' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-300' :
                'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300'
              }`}>
                {check.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {check.title}
                </h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {check.description}
                </p>
                {check.action && (
                  <button
                    onClick={check.action.onClick}
                    className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
                  >
                    {check.action.label} →
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
