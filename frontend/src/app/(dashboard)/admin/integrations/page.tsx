'use client';

export default function IntegrationsPage() {
    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-[1400px] mx-auto px-6 py-6">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">Entegrasyonlar</h1>
                    <p className="text-gray-500 mt-0.5">Dış sistemler ve servislerle bağlantıları yönetin</p>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center justify-center text-center">
                    <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
                        <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 010 5.656l-4 4a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l4-4a4 4 0 015.656 5.656l-1.5 1.5" />
                        </svg>
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-1">Entegrasyon modülü henüz uygulanmadı</h3>
                    <p className="text-sm text-gray-500 max-w-md">
                        Dış sistem entegrasyonları (LDAP, SMTP, dosya depolama, SIEM vb.) için henüz bir backend servisi bulunmuyor.
                        Bu alan gerçek entegrasyon altyapısı kurulduğunda aktif hale gelecektir.
                    </p>
                </div>
            </div>
        </div>
    );
}
