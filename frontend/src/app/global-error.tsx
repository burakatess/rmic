'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
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
    <html lang="tr">
      <body className="antialiased">
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans">
          <div className="w-full max-w-md text-center">
            <h1 className="text-2xl font-bold text-white tracking-tight">Uygulama başlatılamadı</h1>
            <p className="text-base text-slate-400 mt-2">
              Beklenmeyen bir hata oluştu ve sorun kaydedildi. Sayfayı yenilemeyi deneyin.
            </p>
            <button
              onClick={reset}
              className="mt-8 h-11 px-5 inline-flex items-center justify-center rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Tekrar dene
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
