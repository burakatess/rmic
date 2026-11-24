'use client';

import { PageShell, PageHeader, EmptyState } from '@/components/ui';
import { PermissionGate } from '@/components/auth';
import { LdapConnectionsPanel } from '@/components/admin/LdapConnectionsPanel';

export default function IntegrationsPage() {
    return (
        <PageShell>
            <PageHeader
                title="Entegrasyonlar"
                description="Dış sistemler ve servislerle bağlantıları yönetin"
                breadcrumbs={[{ label: 'Yönetim' }, { label: 'Entegrasyonlar' }]}
            />
            {/* LDAP bağlantıları yalnız sistem yöneticisine açıktır (backend @Roles('SYSTEM_ADMIN')). */}
            <PermissionGate permission="*" fallback={<p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6">LDAP bağlantılarını yalnız sistem yöneticisi yönetebilir.</p>}>
                <LdapConnectionsPanel />
            </PermissionGate>
            <div className="mt-5 bg-white rounded-xl border border-slate-200 shadow-sm">
                <EmptyState
                    title="Diğer entegrasyonlar henüz uygulanmadı"
                    description="SMTP, dosya depolama ve diğer dış sistem bağlantıları için backend servisi henüz yok; SIEM aktarımı Denetim İzi ekranındadır."
                />
            </div>
        </PageShell>
    );
}
