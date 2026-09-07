import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center mb-6 relative">
          <div
            className="absolute inset-0 rounded-[20px] blur-2xl opacity-70"
            style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
          />
          <div className="relative w-[72px] h-[72px] rounded-[20px] bg-slate-800 border border-slate-700 flex items-center justify-center">
            <span className="text-3xl font-bold text-blue-400">404</span>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white tracking-tight">Sayfa bulunamadı</h1>
        <p className="text-base text-slate-400 mt-2">
          Aradığınız sayfa taşınmış, kaldırılmış olabilir ya da hiç var olmamış olabilir.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="h-11 px-5 inline-flex items-center justify-center rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Panele dön
          </Link>
          <Link
            href="/login"
            className="h-11 px-5 inline-flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            Girişe dön
          </Link>
        </div>
      </div>
    </div>
  );
}
