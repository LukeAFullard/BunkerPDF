import { useState, useEffect } from 'react';
import Joyride, { STATUS, type Step, type CallBackProps } from 'react-joyride';

export function OnboardingTour() {
  const [run, setRun] = useState(false);

  useEffect(() => {
    // Check localStorage asynchronously to avoid hydration mismatch
    if (typeof window !== 'undefined') {
      const seen = localStorage.getItem('bunkerpdf-tour-seen');
      if (!seen) {
        setRun(true);
      }
    }
  }, []);

  const steps: Step[] = [
    {
      target: '.tour-step-1',
      content: 'Welcome to BunkerPDF! This is where you can drop your PDF files to get started. Everything happens locally in your browser.',
      disableBeacon: true,
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
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status)) {
      setRun(false);
      localStorage.setItem('bunkerpdf-tour-seen', 'true');
    }
  };

  return (
    <Joyride
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
