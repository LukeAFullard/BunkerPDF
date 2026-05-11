import { useEffect, useRef } from 'react';
import { X, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuditStore } from '../../store/auditStore';

interface PrivacyAuditLogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PrivacyAuditLogModal({ isOpen, onClose }: PrivacyAuditLogModalProps) {
  const { logs, clearLogs } = useAuditStore();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => closeButtonRef.current?.focus(), 10);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-modal-title"
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 text-green-600 rounded-lg">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h2 id="audit-modal-title" className="text-xl font-bold text-gray-800">Privacy Audit Log</h2>
              <p className="text-sm text-gray-500">A local history of your actions. No data leaves this device.</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {logs.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No actions recorded yet. Start working with a PDF to see your log here.
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <div key={log.id} className="flex gap-4 p-4 rounded-lg border border-gray-100 bg-gray-50/50">
                  <div className="text-xs text-gray-400 font-mono whitespace-nowrap pt-1">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-800">{log.action}</div>
                    <div className="text-sm text-gray-600 mt-1">{log.details}</div>
                    {log.documentName && (
                      <div className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                        <span className="font-medium bg-white px-2 py-1 rounded border border-gray-200">
                          {log.documentName}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {logs.length > 0 && (
          <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center rounded-b-xl">
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <ShieldCheck size={14} className="text-green-500" />
              All data is stored locally in your browser.
            </span>
            <button
              onClick={clearLogs}
              className="flex items-center gap-2 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              <Trash2 size={16} />
              Clear Log
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
