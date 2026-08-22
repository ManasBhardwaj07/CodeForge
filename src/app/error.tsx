'use client'; // Error components must be Client Components

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Optionally log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] p-4 text-center">
      <div className="forge-card max-w-md w-full p-8 animate-pop">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ background: "rgba(244,63,94,0.1)", color: "#f43f5e" }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-3" style={{ color: "#e2e8f0" }}>Something went wrong!</h2>
        <p className="text-sm mb-6" style={{ color: "#94a3b8" }}>
          An unexpected error occurred while rendering this page. You can try recovering the session.
        </p>
        <button
          onClick={() => reset()}
          className="forge-btn-primary w-full py-2.5 rounded-lg font-semibold transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
