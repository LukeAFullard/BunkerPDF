import { useEngineStore } from '../../store/engineStore';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function EngineStatusPill() {
  const { aiStatus, aiError, pyodideStatus, pyodideError, pyodideStage } = useEngineStore();

  let statusText = 'Ready';
  let statusColor = 'bg-green-100 text-green-800 border-green-200';

  if (pyodideStatus === 'error' || aiStatus === 'error') {
    statusText = 'Error Loading Engines';
    statusColor = 'bg-red-100 text-red-800 border-red-200';
  } else if (pyodideStatus === 'loading') {
    statusText = pyodideStage ? `Loading tools: ${pyodideStage}` : 'Loading advanced features (first time only)...';
    statusColor = 'bg-yellow-100 text-yellow-800 border-yellow-200';
  } else if (aiStatus === 'loading') {
    statusText = 'Preparing smart tools...';
    statusColor = 'bg-yellow-100 text-yellow-800 border-yellow-200';
  } else if (pyodideStatus === 'ready' && aiStatus === 'ready') {
    statusText = 'All features ready';
    statusColor = 'bg-blue-100 text-blue-800 border-blue-200';
  }

  return (
    <div
      className={twMerge(
        clsx(
          'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border transition-colors',
          statusColor
        )
      )}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      title={aiError || pyodideError || statusText}
    >
      {(aiStatus === 'loading' || pyodideStatus === 'loading') && (
        <svg className="animate-spin -ml-1 mr-2 h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {statusText}
    </div>
  );
}
