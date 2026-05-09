import { useState, useEffect } from 'react';
import * as JoyrideModule from 'react-joyride';

// React-joyride TypeScript definitions and exports can be finicky depending on bundler
// We cast through any to ensure both dev and prod builds work correctly
const Joyride = (JoyrideModule as any).default || JoyrideModule;
const { STATUS } = JoyrideModule as any;
type Step = any;
type CallBackProps = any;

export function OnboardingTour() {
  const [run, setRun] = useState(false);

  useEffect(() => {
    // Check localStorage asynchronously to avoid hydration mismatch
    if (typeof window !== 'undefined') {
      const seen = localStorage.getItem('bunkerpdf-tour-seen');
      if (!seen) {
        setTimeout(() => setRun(true), 0);
      }
    }
  }, []);

  const steps: Step[] = [
    {
      target: '.tour-step-1',
      content: 'Welcome to BunkerPDF! This is where you can drop your PDF files to get started. Everything happens locally in your browser.',
      disableBeacon: true as any,
    },
    {
      target: '.tour-step-2',
      content: 'You can redact sensitive information automatically using our offline AI models.',
    },
    {
      target: '.tour-step-3',
      content: 'Merge multiple PDFs or split them apart instantly without uploading to any server.',
    }
  ];

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS?.FINISHED, STATUS?.SKIPPED].filter(Boolean);

    if (finishedStatuses.includes(status)) {
      setRun(false);
      localStorage.setItem('bunkerpdf-tour-seen', 'true');
    }
  };

  // Ensure we have a valid component function to render
  const Component = typeof Joyride === 'function' ? Joyride : (Joyride as any).Joyride;
  if (!Component) return null;

  return (
    <Component
      steps={steps}
      run={run}
      continuous={true}
      showSkipButton={true}
      callback={handleJoyrideCallback}
      styles={{
        options: {
          primaryColor: '#2563eb', // Tailwind blue-600
        },
      }}
    />
  );
}
