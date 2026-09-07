'use client';

import { PageShell, PageHeader, EmptyState } from '@/components/ui';

export default function IntegrationsPage() {
    return (
        <PageShell>
            <PageHeader
                title="Entegrasyonlar"
                description="Dış sistemler ve servislerle bağlantıları yönetin"
                breadcrumbs={[{ label: 'Yönetim' }, { label: 'Entegrasyonlar' }]}
            />

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <EmptyState
                    icon={
                        <svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 010 5.656l-4 4a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l4-4a4 4 0 015.656 5.656l-1.5 1.5" />
                        </svg>
                    }
                    title="Entegrasyon modülü henüz uygulanmadı"
                    description="Dış sistem entegrasyonları (LDAP, SMTP, dosya depolama, SIEM vb.) için henüz bir backend servisi bulunmuyor. Bu alan gerçek entegrasyon altyapısı kurulduğunda aktif hale gelecektir."
                />
            </div>
        </PageShell>
    );
}
