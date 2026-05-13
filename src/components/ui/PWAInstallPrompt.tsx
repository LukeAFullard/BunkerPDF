import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

export function PWAInstallPrompt() {
  const [isVisible, setIsVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  useEffect(() => {
    // Check visits
    const visitCount = parseInt(localStorage.getItem("visitCount") || "0", 10) + 1;
    localStorage.setItem("visitCount", visitCount.toString());
    const hasDismissed = localStorage.getItem("pwaPromptDismissed") === "true";

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (visitCount >= 3 && !hasDismissed) {
        setIsVisible(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Fallback if beforeinstallprompt is not supported or already fired,
    // just show the UI banner if visitCount >= 3 (though installing might not work on all browsers without prompt)
    if (visitCount >= 3 && !hasDismissed && !window.matchMedia('(display-mode: standalone)').matches) {
        setTimeout(() => setIsVisible(true), 0);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      setDeferredPrompt(null);
    } else {
      // Guide user for iOS/Safari where beforeinstallprompt isn't supported
      alert("To install, tap the Share button and select 'Add to Home Screen'.");
    }
    setIsVisible(false);
    localStorage.setItem("pwaPromptDismissed", "true");
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem("pwaPromptDismissed", "true");
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-2xl rounded-xl p-5 border border-white/10 w-80 animate-in slide-in-from-bottom-5 fade-in duration-300">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 text-white/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded p-1 transition-colors"
        aria-label="Dismiss install prompt"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-4">
        <div className="bg-white/20 p-2 rounded-lg shrink-0">
            <Download className="w-6 h-6 text-white" />
        </div>
        <div>
          <h4 className="text-base font-semibold mb-1">
            Install BunkerPDF
          </h4>
          <p className="text-sm text-white/80 leading-relaxed mb-4">
            Get the full offline experience. Install as an app to process PDFs without an internet connection.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleInstall}
              className="flex-1 bg-white text-indigo-700 hover:bg-gray-50 py-2 rounded-md font-medium text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-700"
            >
              Install App
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
