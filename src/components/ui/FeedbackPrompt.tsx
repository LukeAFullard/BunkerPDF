import { useUIStore } from "../../store/uiStore";
import { X, ThumbsUp, ThumbsDown } from "lucide-react";
import { useState } from "react";

export function FeedbackPrompt() {
  const { feedbackPrompt, hideFeedbackPrompt } = useUIStore();
  const [submitted, setSubmitted] = useState(false);

  if (!feedbackPrompt.isOpen) return null;

  const handleFeedback = (isPositive: boolean) => {
    // In a real app, this would send telemetry
    console.log(`Feedback for ${feedbackPrompt.toolName}: ${isPositive ? 'Positive' : 'Negative'}`);
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      hideFeedbackPrompt();
    }, 2000);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-gray-800 shadow-xl rounded-lg p-4 border border-gray-200 dark:border-gray-700 w-80 animate-in slide-in-from-bottom-5">
      <button
        onClick={() => { setSubmitted(false); hideFeedbackPrompt(); }}
        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
      >
        <X className="w-4 h-4" />
      </button>

      {!submitted ? (
        <>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            How was the output?
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Help us improve the {feedbackPrompt.toolName} tool.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleFeedback(true)}
              className="flex-1 flex items-center justify-center gap-2 bg-gray-50 hover:bg-green-50 text-gray-700 hover:text-green-700 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-green-900/30 dark:hover:text-green-400 py-2 rounded-md border border-gray-200 dark:border-gray-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            >
              <ThumbsUp className="w-4 h-4" />
              <span className="text-sm font-medium">Good</span>
            </button>
            <button
              onClick={() => handleFeedback(false)}
              className="flex-1 flex items-center justify-center gap-2 bg-gray-50 hover:bg-red-50 text-gray-700 hover:text-red-700 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-red-900/30 dark:hover:text-red-400 py-2 rounded-md border border-gray-200 dark:border-gray-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              <ThumbsDown className="w-4 h-4" />
              <span className="text-sm font-medium">Bad</span>
            </button>
          </div>
        </>
      ) : (
        <div className="py-4 text-center">
          <p className="text-sm font-medium text-green-600 dark:text-green-400">
            Thanks for your feedback!
          </p>
        </div>
      )}
    </div>
  );
}
