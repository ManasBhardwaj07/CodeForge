'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-[#020817] text-slate-300 antialiased font-sans flex items-center justify-center min-h-screen">
        <div className="text-center p-8 max-w-md w-full">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ background: "rgba(244,63,94,0.1)", color: "#f43f5e" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-4 text-slate-100">Critical Application Error</h1>
          <p className="text-sm text-slate-400 mb-8">
            CodeForge encountered a catastrophic failure at the root layout level.
          </p>
          <button
            onClick={() => reset()}
            className="w-full py-3 px-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-semibold transition-colors"
          >
            Attempt Recovery
          </button>
        </div>
      </body>
    </html>
  );
}
