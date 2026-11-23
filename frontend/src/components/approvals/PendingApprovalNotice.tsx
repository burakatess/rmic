'use client';

/**
 * "Onay bekliyor" bildirimi: işlemin KİM tarafından onaylanmasının beklendiğini açıkça yazar.
 * Plan, aksiyon, takip, test ve silme taleplerinde aynı dili kullanır.
 */
export interface Approver { name: string; role?: string }

const ago = (iso?: string | null): string | null => {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return null;
    const m = Math.floor(ms / 60000);
    if (m < 1) return 'az önce';
    if (m < 60) return `${m} dk önce`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} saat önce`;
    return `${Math.floor(h / 24)} gün önce`;
};

export function PendingApprovalNotice({ title, waitingFor, sentBy, sentAt, hint, testId = 'pending-approval' }: {
    title: string;
    waitingFor: Approver[];
    sentBy?: string | null;
    sentAt?: string | null;
    hint?: string;
    testId?: string;
}) {
    const when = ago(sentAt);
    const none = waitingFor.length === 0;
    return (
        <div role="status" data-testid={testId}
            className={`rounded-lg border px-3.5 py-2.5 text-sm ${none ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
            <p className="font-semibold">{title}</p>
            <p className="mt-0.5">
                {none ? (
                    <>Onaylayabilecek yetkili kullanıcı bulunamadı — bir yönetici atanmadan işlem ilerlemez.</>
                ) : (
                    <>Onaylayacak: <b>{waitingFor.map(a => (a.role ? `${a.name} (${a.role})` : a.name)).join(', ')}</b></>
                )}
            </p>
            {(sentBy || when) && (
                <p className="mt-0.5 text-xs opacity-80">
                    {sentBy && <>Gönderen: {sentBy}</>}{sentBy && when && ' · '}{when && <>Gönderildi: {when}</>}
                </p>
            )}
            {hint && <p className="mt-1 text-xs opacity-80">{hint}</p>}
        </div>
    );
}
