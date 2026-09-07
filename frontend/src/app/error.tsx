'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center mb-6 relative">
          <div
            className="absolute inset-0 rounded-[20px] blur-2xl opacity-70"
            style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)' }}
          />
          <div className="relative w-[72px] h-[72px] rounded-[20px] bg-slate-800 border border-slate-700 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white tracking-tight">Beklenmeyen bir hata oluştu</h1>
        <p className="text-base text-slate-400 mt-2">
          Sorun kaydedildi. Sayfayı yeniden yüklemeyi deneyebilir ya da panele dönebilirsiniz.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="h-11 px-5 inline-flex items-center justify-center rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Tekrar dene
          </button>
          <a
            href="/dashboard"
            className="h-11 px-5 inline-flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            Panele dön
          </a>
        </div>
      </div>
    </div>
  );
}
