'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import {
    DetailShell, DetailHeader, DetailSection, Tabs, Timeline,
    StatusBadge, Button, LoadingState, EmptyState, FileUpload,
} from '@/components/ui';
import type { TimelineItem, TimelineVariant, AttachmentMeta } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import AddActionModal from '@/components/modals/AddActionModal';
import { FindingFollowUpModal } from '@/components/modals/FindingFollowUpModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Attachment { id: string; fileName?: string; originalName: string; mimeType: string; sizeBytes: number; createdAt: string }
interface LinkedRisk { id: string; riskId: string; name: string; status: string; residualRiskScore?: number; inherentRiskScore?: number; owner?: { firstName: string; lastName: string } }
interface LinkedControl { id: string; controlId: string; name: string; directorate?: string; frequency?: string; status?: string; effectivenessStatus?: string }
interface Action {
    id: string; actionId: string; description: string; status: string; dueDate: string; completedAt?: string | null;
    owner?: { id: string; firstName: string; lastName: string };
    responsibleDepartment?: string | null; notes?: string | null;
    attachments?: Attachment[];
}
interface FollowUp {
    id: string; followUpId: string; status: string; actionId?: string | null;
    result?: string | null; resolutionOutcome?: string | null; newFollowUpDate?: string | null;
    explanation?: string | null; birimCevabi?: string | null; currentStatusDetail?: string | null;
    internalControlAssessment?: string | null; targetResolutionDate?: string | null;
    testDate?: string | null; plannedDate?: string | null; notes?: string | null;
    newActionRequired?: boolean; attachments?: Attachment[];
    createdAt: string; updatedAt?: string;
}
interface StatusLog { id: string; entryDate: string; text: string; authorName?: string | null }
interface AuditEntry {
    id: string; entryDate: string; evaluator?: string | null; operation?: string | null;
    changeType?: string | null; explanation?: string | null; fieldName?: string | null;
    oldValue?: any; newValue?: any; workflowStatus?: string | null;
    previousWorkflowStatus?: string | null; resolutionStatus?: string | null; result?: string | null; userId?: string | null;
}
interface Finding {
    id: string; findingId: string; findingType: string | null; description: string; summary: string | null;
    gmy: string | null; relatedDepartment: string | null; iletisimKisisi: string | null;
    responsiblePerson: string | null; assigneeId: string | null;
    severity: string; status: string; workflowStatus: string; resolutionStatus: string;
    internalControlAssessment: string | null; currentStatusDetail: string | null;
    birimCevabi: string | null; recommendation: string | null;
    testDate: string | null; targetResolutionDate: string | null; closedDate: string | null;
    risk: LinkedRisk | null; control: LinkedControl | null; linkedRisks: LinkedRisk[];
    actions: Action[]; followUps: FollowUp[]; attachments: Attachment[]; statusLogs: StatusLog[];
    _count: { actions: number; followUps: number; linkedRisks: number; attachments: number };
    createdAt: string; updatedAt: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

type BV = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'warning' | 'neutral' | 'primary';

const findingTypeConfig: Record<string, { label: string; variant: BV }> = {
    BT: { label: 'Bilgi Teknolojileri', variant: 'primary' },
    IB: { label: 'İş Birimleri', variant: 'info' },
};

const severityConfig: Record<string, { label: string; sublabel: string; variant: BV }> = {
    CRITICAL: { label: 'KZ', sublabel: 'Kontrol Zayıflığı', variant: 'critical' },
    HIGH:     { label: 'KD', sublabel: 'Kayda Değer Kontrol Eksikliği', variant: 'high' },
    MEDIUM:   { label: 'ÖK', sublabel: 'Önemli Kontrol Eksikliği', variant: 'medium' },
    LOW:      { label: 'Düşük', sublabel: 'Düşük Önem', variant: 'low' },
};

const resolutionConfig: Record<string, { label: string; variant: BV }> = {
    DEVAM_EDIYOR:          { label: 'Devam Ediyor',         variant: 'info' },
    KISMEN_KAPATILDI:      { label: 'Kısmen Kapatıldı',     variant: 'warning' },
    KAPATILDI:             { label: 'Kapatıldı',            variant: 'success' },
    ERTELENDI:             { label: 'Ertelendi',            variant: 'neutral' },
    YENI_AKSIYON_GEREKLI:  { label: 'Yeni Aksiyon Gerekli', variant: 'high' },
};

const workflowConfig: Record<string, { label: string; variant: BV }> = {
    TASLAK:                        { label: 'Taslak',                variant: 'neutral' },
    MUTABAKATA_GONDERILDI:         { label: 'Mutabakata Gönderildi', variant: 'warning' },
    IC_KONTROL_ONAYINA_GONDERILDI: { label: 'İKS Onayında',          variant: 'warning' },
    MUTABAKAT_YAPILDI:             { label: 'Mutabakat Yapıldı',     variant: 'success' },
    IPTAL:                         { label: 'İptal',                 variant: 'neutral' },
};

const actionStatusConfig: Record<string, { label: string; variant: BV }> = {
    BEKLIYOR:     { label: 'Bekliyor',     variant: 'neutral' },
    DEVAM_EDIYOR: { label: 'Devam Ediyor', variant: 'warning' },
    TAMAMLANDI:   { label: 'Tamamlandı',   variant: 'info' },
    YETERSIZ:     { label: 'Yetersiz',     variant: 'high' },
    KAPATILDI:    { label: 'Kapatıldı',    variant: 'success' },
};

const followUpStatusConfig: Record<string, { label: string; variant: BV }> = {
    BEKLIYOR:     { label: 'Bekliyor',     variant: 'neutral' },
    DEVAM_EDIYOR: { label: 'Devam Ediyor', variant: 'warning' },
    TAMAMLANDI:   { label: 'Tamamlandı',   variant: 'info' },
    ONAYLANDI:    { label: 'Onaylandı',    variant: 'success' },
};

const operationLabels: Record<string, { label: string; variant: TimelineVariant }> = {
    FINDING_CREATED:     { label: 'Bulgu Oluşturuldu',         variant: 'success' },
    FINDING_UPDATED:     { label: 'Bulgu Güncellendi',         variant: 'info' },
    STATUS_CHANGED:      { label: 'Durum Değişti',             variant: 'info' },
    ACTION_ADDED:        { label: 'Aksiyon Eklendi',           variant: 'info' },
    ACTION_UPDATED:      { label: 'Aksiyon Güncellendi',       variant: 'info' },
    ACTION_CLOSED:       { label: 'Aksiyon Kapatıldı',         variant: 'success' },
    FOLLOWUP_OPENED:     { label: 'Takip Açıldı',              variant: 'info' },
    FOLLOWUP_COMPLETED:  { label: 'Takip Sonuçlandırıldı',     variant: 'success' },
    TEST_DATE_CHANGED:   { label: 'Test Tarihi Değişti',       variant: 'info' },
    TARGET_DATE_CHANGED: { label: 'Hedef Tarih Değişti',       variant: 'info' },
    FILE_UPLOADED:       { label: 'Dosya Yüklendi',            variant: 'info' },
    FILE_DELETED:        { label: 'Dosya Silindi',             variant: 'critical' },
    FINDING_CLOSED:      { label: 'Bulgu Kapatıldı',           variant: 'success' },
    FINDING_REOPENED:    { label: 'Bulgu Yeniden Açıldı',      variant: 'warning' },
    WORKFLOW_CHANGE:     { label: 'Akış Değişikliği',          variant: 'info' },
    RESOLUTION_CHANGED:  { label: 'Çözüm Durumu Güncellendi',  variant: 'info' },
    ACTION_CREATED:      { label: 'Aksiyon Oluşturuldu',       variant: 'info' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (d?: string | null) => {
    if (!d) return '—';
    const date = new Date(d);
    return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('tr-TR');
};

const fmtDatetime = (d?: string | null) => {
    if (!d) return '—';
    const date = new Date(d);
    return isNaN(date.getTime()) ? '—' : date.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const getDaysLeft = (d: string | null) => {
    if (!d) return null;
    return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
};

const toAttachmentMeta = (a: Attachment): AttachmentMeta => ({
    id: a.id,
    fileName: a.fileName || '',
    originalName: a.originalName,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
});

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
            <div className="text-sm text-slate-800">{value || <span className="text-slate-300 italic">—</span>}</div>
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'detay' | 'aksiyonlar' | 'takip' | 'riskler' | 'ekler' | 'tarihce';
const TAB_KEYS: Tab[] = ['detay', 'aksiyonlar', 'takip', 'riskler', 'ekler', 'tarihce'];

export default function FindingDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { success, error: showError } = useToast();

    const [finding, setFinding] = useState<Finding | null>(null);
    const [auditTrail, setAuditTrail] = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>('detay');

    const [addActionOpen, setAddActionOpen] = useState(false);
    const [editAction, setEditAction] = useState<any | null>(null);
    const [followUpOpen, setFollowUpOpen] = useState(false);
    const [selectedFollowUp, setSelectedFollowUp] = useState<FollowUp | null>(null);

    // Workflow dialog
    const [workflowAction, setWorkflowAction] = useState<string | null>(null);
    const [workflowInput, setWorkflowInput] = useState('');
    const [workflowLoading, setWorkflowLoading] = useState(false);

    // Status log inline add
    const [logText, setLogText] = useState('');
    const [logSaving, setLogSaving] = useState(false);

    // ?tab= deep-link (örn. /findings/:id?tab=takip)
    useEffect(() => {
        const t = new URLSearchParams(window.location.search).get('tab');
        if (t && TAB_KEYS.includes(t as Tab)) setActiveTab(t as Tab);
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [f, h] = await Promise.all([
                api.getFinding(id) as Promise<Finding>,
                api.getFindingStatusHistory(id) as Promise<AuditEntry[]>,
            ]);
            setFinding(f);
            setAuditTrail(h);
        } catch { showError('Hata', 'Bulgu yüklenemedi.'); }
        finally { setLoading(false); }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const submitWorkflow = async () => {
        if (!finding || !workflowAction) return;
        setWorkflowLoading(true);
        try {
            if (workflowAction === 'mutabakata-gonder') await api.mutabakataGonder(finding.id);
            else if (workflowAction === 'ic-kontrol-onayina-gonder') await api.icKontrolOnayinaGonder(finding.id, { birimCevabi: workflowInput });
            else if (workflowAction === 'mutabakat-onayla') await api.mutabakatOnayla(finding.id, { internalControlAssessment: workflowInput });
            else if (workflowAction === 'mutabakat-geri-gonder') { if (!workflowInput.trim()) { showError('Zorunlu', 'Gerekçe yazın.'); return; } await api.mutabakatGeriGonder(finding.id, workflowInput); }
            else if (workflowAction === 'iptal-et') { if (!workflowInput.trim()) { showError('Zorunlu', 'İptal gerekçesi yazın.'); return; } await api.iptalEt(finding.id, workflowInput); }
            success('Başarılı', 'İşlem tamamlandı.');
            setWorkflowAction(null); setWorkflowInput(''); load();
        } catch (err: any) { showError('Hata', err?.message || 'İşlem gerçekleştirilemedi.'); }
        finally { setWorkflowLoading(false); }
    };

    const addLog = async () => {
        if (!logText.trim() || !finding) return;
        setLogSaving(true);
        try {
            await api.appendStatusLog(finding.id, { text: logText });
            success('Eklendi', 'Durum notu kaydedildi.');
            setLogText(''); load();
        } catch { showError('Hata', 'Not eklenemedi.'); }
        finally { setLogSaving(false); }
    };

    // Attachment upload/remove — finding / action / followup (aynı API çağrıları)
    const uploadFindingAttachment = async (meta: AttachmentMeta) => {
        if (!finding) return;
        try {
            await api.addFindingAttachment(finding.id, meta);
            success('Eklendi', `${meta.originalName} dosya kaydı oluşturuldu.`);
            load();
        } catch { showError('Hata', `${meta.originalName} eklenemedi.`); }
    };

    const uploadActionAttachment = async (actionId: string, meta: AttachmentMeta) => {
        if (!finding) return;
        try {
            await api.addActionAttachment(finding.id, actionId, meta);
            success('Eklendi', `${meta.originalName} dosya kaydı oluşturuldu.`);
            load();
        } catch { showError('Hata', `${meta.originalName} eklenemedi.`); }
    };

    const uploadFollowUpAttachment = async (fuId: string, meta: AttachmentMeta) => {
        if (!finding) return;
        try {
            await api.addFollowUpAttachment(finding.id, fuId, meta);
            success('Eklendi', `${meta.originalName} dosya kaydı oluşturuldu.`);
            load();
        } catch { showError('Hata', `${meta.originalName} eklenemedi.`); }
    };

    const removeFindingAttachment = async (attId: string) => {
        if (!finding) return;
        try { await api.removeFindingAttachment(finding.id, attId); success('Silindi', ''); load(); }
        catch { showError('Hata', 'Dosya silinemedi.'); }
    };

    const removeActionAttachment = async (actionId: string, attId: string) => {
        if (!finding) return;
        try { await api.removeActionAttachment(finding.id, actionId, attId); success('Silindi', ''); load(); }
        catch { showError('Hata', 'Dosya silinemedi.'); }
    };

    const removeFollowUpAttachment = async (fuId: string, attId: string) => {
        if (!finding) return;
        try { await api.removeFollowUpAttachment(finding.id, fuId, attId); success('Silindi', ''); load(); }
        catch { showError('Hata', 'Dosya silinemedi.'); }
    };

    if (loading) {
        return (
            <DetailShell>
                <LoadingState message="Bulgu detayı yükleniyor..." />
            </DetailShell>
        );
    }

    if (!finding) {
        return (
            <DetailShell>
                <EmptyState
                    title="Bulgu bulunamadı"
                    description="Aradığınız bulgu kaydı mevcut değil veya erişim yetkiniz yok."
                    actionLabel="Bulgu Envanterine Dön"
                    onAction={() => router.push('/findings')}
                />
            </DetailShell>
        );
    }

    const typeCfg = findingTypeConfig[finding.findingType || ''];
    const sevCfg = severityConfig[finding.severity] || { label: finding.severity, sublabel: '', variant: 'neutral' as BV };
    const resCfg = resolutionConfig[finding.resolutionStatus] || resolutionConfig['DEVAM_EDIYOR'];
    const wfCfg = workflowConfig[finding.workflowStatus] || workflowConfig['TASLAK'];
    const daysLeft = getDaysLeft(finding.targetResolutionDate);
    const isOverdue = finding.resolutionStatus !== 'KAPATILDI' && daysLeft !== null && daysLeft < 0;
    const isApproaching = finding.resolutionStatus !== 'KAPATILDI' && daysLeft !== null && daysLeft >= 0 && daysLeft <= 14;

    const tabs = [
        { key: 'detay',      label: 'Bulgu Detayı' },
        { key: 'aksiyonlar', label: 'Aksiyonlar',        count: finding._count?.actions },
        { key: 'takip',      label: 'Takip Çalışmaları', count: finding._count?.followUps },
        { key: 'riskler',    label: 'İlişkili Riskler',  count: finding._count?.linkedRisks },
        { key: 'ekler',      label: 'Ekler',             count: finding._count?.attachments },
        { key: 'tarihce',    label: 'Tarihçe',           count: auditTrail.length },
    ];

    const timelineItems: TimelineItem[] = auditTrail.map(entry => {
        const op = entry.operation || entry.changeType;
        const opCfg = op ? operationLabels[op] : null;
        return {
            id: entry.id,
            title: opCfg?.label || op || 'İşlem',
            date: fmtDatetime(entry.entryDate),
            user: entry.evaluator || entry.userId || undefined,
            variant: opCfg?.variant || 'info',
            description: (
                <div className="space-y-1.5">
                    {entry.workflowStatus && (
                        <p>
                            {entry.previousWorkflowStatus && (
                                <span className="text-slate-400">{workflowConfig[entry.previousWorkflowStatus]?.label || entry.previousWorkflowStatus} → </span>
                            )}
                            <span className="font-semibold text-slate-700">{workflowConfig[entry.workflowStatus]?.label || entry.workflowStatus}</span>
                        </p>
                    )}
                    {(entry.resolutionStatus || entry.result) && (
                        <p className="flex items-center gap-1.5 flex-wrap">
                            {entry.resolutionStatus && (
                                <StatusBadge variant={resolutionConfig[entry.resolutionStatus]?.variant || 'neutral'} dot>
                                    {resolutionConfig[entry.resolutionStatus]?.label || entry.resolutionStatus}
                                </StatusBadge>
                            )}
                            {entry.result && (
                                <StatusBadge variant={entry.result === 'YETERLI' ? 'success' : 'critical'}>
                                    {entry.result === 'YETERLI' ? 'Yeterli' : 'Yetersiz'}
                                </StatusBadge>
                            )}
                        </p>
                    )}
                    {entry.explanation && <p className="leading-relaxed">{entry.explanation}</p>}
                    {entry.fieldName && (
                        <p className="text-[10px]">
                            <span className="font-semibold">{entry.fieldName}:</span>{' '}
                            {entry.oldValue != null && <span className="line-through text-red-400">{JSON.stringify(entry.oldValue)}</span>}{' '}
                            {entry.newValue != null && <span className="text-emerald-600 font-medium">→ {JSON.stringify(entry.newValue)}</span>}
                        </p>
                    )}
                </div>
            ),
        };
    });

    return (
        <DetailShell>

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <DetailHeader
                sticky
                breadcrumbs={[
                    { label: 'Bulgu Yönetimi' },
                    { label: 'Bulgu Envanteri', href: '/findings' },
                    { label: finding.findingId },
                ]}
                entityId={finding.findingId}
                title={finding.summary || finding.description}
                badges={
                    <>
                        <StatusBadge variant={sevCfg.variant}>{sevCfg.label}</StatusBadge>
                        {typeCfg && <StatusBadge variant={typeCfg.variant}>{typeCfg.label}</StatusBadge>}
                        <StatusBadge variant={wfCfg.variant} dot>{wfCfg.label}</StatusBadge>
                        <StatusBadge variant={resCfg.variant} dot>{resCfg.label}</StatusBadge>
                        {isOverdue && <StatusBadge variant="critical" dot>{Math.abs(daysLeft!)} gün gecikmiş</StatusBadge>}
                        {isApproaching && <StatusBadge variant="warning" dot>{daysLeft} gün kaldı</StatusBadge>}
                    </>
                }
                meta={
                    <>
                        {finding.relatedDepartment && <span>Direktörlük: {finding.relatedDepartment}</span>}
                        {finding.gmy && <span>GMY: {finding.gmy}</span>}
                        {finding.iletisimKisisi && <span>İletişim: {finding.iletisimKisisi}</span>}
                        {finding.targetResolutionDate && (
                            <span className={isOverdue ? 'text-red-500 font-semibold' : ''}>
                                Hedef: {fmt(finding.targetResolutionDate)}
                            </span>
                        )}
                    </>
                }
                actions={
                    <>
                        {finding.workflowStatus === 'TASLAK' && (
                            <Button variant="primary" size="sm" onClick={() => setWorkflowAction('mutabakata-gonder')}
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>}
                            >
                                Mutabakata Gönder
                            </Button>
                        )}
                        {finding.workflowStatus === 'MUTABAKATA_GONDERILDI' && (
                            <Button variant="primary" size="sm" onClick={() => setWorkflowAction('ic-kontrol-onayina-gonder')}
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                            >
                                İKS Onayına Gönder
                            </Button>
                        )}
                        {finding.workflowStatus === 'IC_KONTROL_ONAYINA_GONDERILDI' && (
                            <>
                                <Button variant="success" size="sm" onClick={() => setWorkflowAction('mutabakat-onayla')}
                                    icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                                >
                                    Mutabakatı Onayla
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => setWorkflowAction('mutabakat-geri-gonder')}
                                    icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>}
                                >
                                    Birime Geri Gönder
                                </Button>
                            </>
                        )}
                        {finding.workflowStatus !== 'IPTAL' && finding.workflowStatus !== 'MUTABAKAT_YAPILDI' && (
                            <Button variant="ghost" size="sm" onClick={() => setWorkflowAction('iptal-et')} className="text-red-500 hover:bg-red-50">
                                İptal Et
                            </Button>
                        )}
                        {finding.workflowStatus === 'MUTABAKAT_YAPILDI' && (
                            <Button variant="ghost" size="sm" onClick={() => setWorkflowAction('iptal-et')} className="text-red-500 hover:bg-red-50">
                                İptal Et
                            </Button>
                        )}
                        <Link href={`/findings/${id}/edit`}>
                            <Button variant="secondary" size="sm"
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>}
                            >
                                Düzenle
                            </Button>
                        </Link>
                    </>
                }
            />

            {/* ── Tabs ───────────────────────────────────────────────────────── */}
            <Tabs
                tabs={tabs}
                activeTab={activeTab}
                onChange={(key) => setActiveTab(key as Tab)}
                className="mb-6"
            />

            {/* ── Content ────────────────────────────────────────────────────── */}
            <div className="space-y-5">

                {/* ═══════ DETAY TAB ═══════ */}
                {activeTab === 'detay' && (
                    <div className="space-y-5">
                        {/* Bulgu Metni / Özeti */}
                        <DetailSection title="Bulgu Özeti & Metni">
                            {finding.summary && (
                                <div className="mb-4">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Bulgu Özeti</p>
                                    <p className="text-base font-semibold text-slate-900 leading-snug">{finding.summary}</p>
                                </div>
                            )}
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Bulgu Metni</p>
                                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{finding.description}</p>
                            </div>
                            {finding.recommendation && (
                                <div className="mt-4 pt-4 border-t border-slate-100">
                                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1.5">Öneri / Düzeltici Faaliyet</p>
                                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{finding.recommendation}</p>
                                </div>
                            )}
                        </DetailSection>

                        <div className="grid grid-cols-3 gap-5">
                            <div className="col-span-2 space-y-5">
                                {/* Kimlik Bilgileri */}
                                <DetailSection title="Kimlik & Sınıflandırma">
                                    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                                        <InfoRow label="Bulgu No" value={<span className="font-mono font-bold text-blue-700">{finding.findingId}</span>} />
                                        <InfoRow label="Bulgu Türü" value={typeCfg ? <StatusBadge variant={typeCfg.variant}>{typeCfg.label}</StatusBadge> : finding.findingType} />
                                        <InfoRow label="Önem Derecesi" value={
                                            <span className="flex items-center gap-2">
                                                <StatusBadge variant={sevCfg.variant}>{sevCfg.label}</StatusBadge>
                                                <span className="text-xs text-slate-500">{sevCfg.sublabel}</span>
                                            </span>
                                        } />
                                        <InfoRow label="Çözüm Durumu" value={<StatusBadge variant={resCfg.variant} dot>{resCfg.label}</StatusBadge>} />
                                    </div>
                                </DetailSection>

                                {/* Sorumluluk */}
                                <DetailSection title="Sorumluluk & Organizasyon">
                                    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                                        <InfoRow label="İlgili Direktörlük" value={finding.relatedDepartment} />
                                        <InfoRow label="İlgili GMY" value={finding.gmy} />
                                        <InfoRow label="İletişim Kişisi" value={finding.iletisimKisisi} />
                                        <InfoRow label="Sorumlu Kişi" value={finding.responsiblePerson} />
                                        {finding.control && (
                                            <InfoRow label="İlgili Kontrol" value={
                                                <Link href={`/controls/${finding.control.id}`} className="font-mono text-emerald-700 hover:underline font-semibold">
                                                    {finding.control.controlId} — {finding.control.name}
                                                </Link>
                                            } />
                                        )}
                                    </div>
                                </DetailSection>

                                {/* Tarihler */}
                                <DetailSection title="Tarihler">
                                    <div className="grid grid-cols-3 gap-x-8 gap-y-4">
                                        <InfoRow label="Bulgu Test Tarihi" value={fmt(finding.testDate)} />
                                        <InfoRow label="Hedef Tamamlanma" value={
                                            <span className={isOverdue ? 'text-red-600 font-semibold' : isApproaching ? 'text-amber-600 font-semibold' : ''}>
                                                {fmt(finding.targetResolutionDate)}
                                            </span>
                                        } />
                                        {finding.closedDate && <InfoRow label="Kapanma Tarihi" value={<span className="text-emerald-700 font-semibold">{fmt(finding.closedDate)}</span>} />}
                                        <InfoRow label="Kayıt Tarihi" value={fmt(finding.createdAt)} />
                                        <InfoRow label="Son Güncelleme" value={fmt(finding.updatedAt)} />
                                    </div>
                                </DetailSection>
                            </div>

                            <div className="space-y-5">
                                {/* Güncel Durum Log */}
                                <DetailSection title="Bulgunun Güncel Durumu">
                                    <div className="space-y-3">
                                        {finding.statusLogs.length === 0 && <p className="text-xs text-slate-400 italic">Henüz güncelleme yok</p>}
                                        <div className="space-y-2 max-h-48 overflow-y-auto">
                                            {finding.statusLogs.map(log => (
                                                <div key={log.id} className="text-xs border-l-2 border-blue-200 pl-3 py-1">
                                                    <p className="text-[10px] text-slate-400 font-mono mb-0.5">{fmtDatetime(log.entryDate)} {log.authorName && `— ${log.authorName}`}</p>
                                                    <p className="text-slate-700 leading-relaxed">{log.text}</p>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="border-t border-slate-100 pt-3 space-y-2">
                                            <textarea
                                                value={logText}
                                                onChange={e => setLogText(e.target.value)}
                                                rows={2}
                                                placeholder="Güncel durum notu ekle…"
                                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-blue-300 outline-none resize-none"
                                            />
                                            <Button size="sm" variant="primary" onClick={addLog} disabled={logSaving || !logText.trim()} className="w-full">
                                                {logSaving ? 'Kaydediliyor…' : 'Not Ekle'}
                                            </Button>
                                        </div>
                                    </div>
                                </DetailSection>

                                {/* Birim Cevabı & İKS Değerlendirmesi */}
                                {finding.birimCevabi && (
                                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">Birim Cevabı</p>
                                        <p className="text-xs text-slate-700 leading-relaxed">{finding.birimCevabi}</p>
                                    </div>
                                )}
                                {finding.internalControlAssessment && (
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2">İç Kontrol Değerlendirmesi</p>
                                        <p className="text-xs text-slate-700 leading-relaxed">{finding.internalControlAssessment}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══════ AKSİYONLAR TAB ═══════ */}
                {activeTab === 'aksiyonlar' && (
                    <div className="space-y-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <h2 className="text-sm font-semibold text-slate-700">Düzeltici Aksiyonlar</h2>
                                <p className="text-xs text-slate-500 mt-0.5">Aksiyon tamamlanma tarihine göre sistem otomatik Takip Çalışması oluşturur. Bulgunun hedef tarihi, en ileri aksiyona göre hesaplanır.</p>
                            </div>
                            <Button variant="primary" size="sm" onClick={() => setAddActionOpen(true)}
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
                            >Yeni Aksiyon</Button>
                        </div>

                        {finding.actions.length === 0 ? (
                            <div className="bg-white border border-dashed border-slate-200 rounded-xl">
                                <EmptyState
                                    title="Henüz aksiyon yok"
                                    description="Düzeltici bir aksiyon tanımlayın"
                                    icon={<svg className="w-12 h-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                                    actionLabel="Aksiyon Ekle"
                                    onAction={() => setAddActionOpen(true)}
                                />
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {finding.actions.map(action => {
                                    const sCfg = actionStatusConfig[action.status] || { label: action.status, variant: 'neutral' as BV };
                                    const aOverdue = action.status !== 'KAPATILDI' && getDaysLeft(action.dueDate) !== null && getDaysLeft(action.dueDate)! < 0;
                                    const relFU = finding.followUps.filter(f => f.actionId === action.id);
                                    return (
                                        <div key={action.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                                            <div className="flex items-start gap-4 p-5">
                                                <div className="flex-shrink-0 w-10 h-10 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-center">
                                                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                                    </svg>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <Link href={`/actions/${action.id}`} className="font-mono text-xs text-orange-600 font-semibold hover:underline">{action.actionId}</Link>
                                                            <StatusBadge variant={sCfg.variant}>{sCfg.label}</StatusBadge>
                                                            {aOverdue && <StatusBadge variant="critical" dot>Gecikmiş</StatusBadge>}
                                                        </div>
                                                        {action.status !== 'KAPATILDI' && (
                                                            <Button variant="secondary" size="xs"
                                                                onClick={() => {
                                                                    setEditAction(action);
                                                                    setAddActionOpen(true);
                                                                }}
                                                                icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>}
                                                            >
                                                                Düzenle
                                                            </Button>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-slate-800 leading-relaxed mb-3">{action.description}</p>
                                                    <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                                                        {action.owner && <span>Sorumlu: {action.owner.firstName} {action.owner.lastName}</span>}
                                                        {action.responsibleDepartment && <span>Birim: {action.responsibleDepartment}</span>}
                                                        <span className={aOverdue ? 'text-red-600 font-semibold' : ''}>Hedef: {fmt(action.dueDate)}</span>
                                                        {action.completedAt && <span className="text-emerald-600">Kapandı: {fmt(action.completedAt)}</span>}
                                                    </div>
                                                    {action.notes && <p className="text-xs text-slate-500 mt-2 bg-slate-50 rounded-lg p-2 border border-slate-100">{action.notes}</p>}
                                                </div>
                                            </div>
                                            {/* Action attachments */}
                                            <div className="px-5 pb-4 border-t border-slate-100 pt-3">
                                                <FileUpload
                                                    compact
                                                    attachments={(action.attachments || []).map(toAttachmentMeta)}
                                                    onUpload={(meta) => uploadActionAttachment(action.id, meta)}
                                                    onRemove={(att) => { if (att.id) removeActionAttachment(action.id, att.id); }}
                                                />
                                            </div>
                                            {/* Linked follow-ups */}
                                            {relFU.length > 0 && (
                                                <div className="px-5 pb-4 border-t border-slate-100 pt-3">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Bu Aksiyona Bağlı Takip Çalışmaları</p>
                                                    <div className="flex gap-2 flex-wrap">
                                                        {relFU.map(fu => {
                                                            const fuCfg = followUpStatusConfig[fu.status] || { label: fu.status, variant: 'neutral' as BV };
                                                            return (
                                                                <button key={fu.id}
                                                                    onClick={() => { setSelectedFollowUp(fu); setFollowUpOpen(true); setActiveTab('takip'); }}
                                                                    className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg text-xs transition-all">
                                                                    <span className="font-mono text-blue-700 font-semibold">{fu.followUpId}</span>
                                                                    <StatusBadge variant={fuCfg.variant}>{fuCfg.label}</StatusBadge>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════ TAKİP ÇALIŞMALARI TAB ═══════ */}
                {activeTab === 'takip' && (
                    <div className="space-y-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <h2 className="text-sm font-semibold text-slate-700">Bulgu Takip Çalışmaları</h2>
                                <p className="text-xs text-slate-500 mt-0.5">Aksiyonlar oluşturulunca otomatik açılır. Takip sonucu ana bulguda güncellenir (append-only log).</p>
                            </div>
                            <Button variant="secondary" size="sm" onClick={() => { setSelectedFollowUp(null); setFollowUpOpen(true); }}
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
                            >
                                Manuel Takip
                            </Button>
                        </div>

                        {finding.followUps.length === 0 ? (
                            <div className="bg-white border border-dashed border-slate-200 rounded-xl">
                                <EmptyState
                                    title="Henüz takip çalışması yok"
                                    description="Aksiyon eklediğinizde otomatik oluşturulur"
                                    icon={<svg className="w-12 h-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
                                />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {finding.followUps.map(fu => {
                                    const fuCfg = followUpStatusConfig[fu.status] || { label: fu.status, variant: 'neutral' as BV };
                                    const resOutCfg = fu.resolutionOutcome ? resolutionConfig[fu.resolutionOutcome] : null;
                                    const linkedAction = finding.actions.find(a => a.id === fu.actionId);
                                    return (
                                        <div key={fu.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                                            <div className="flex items-center justify-between px-5 py-4 bg-slate-50/50 border-b border-slate-100">
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <Link href={`/follow-ups/${fu.id}`} className="font-mono text-sm font-bold text-blue-700 hover:underline">{fu.followUpId}</Link>
                                                        <StatusBadge variant={fuCfg.variant}>{fuCfg.label}</StatusBadge>
                                                        {resOutCfg && <StatusBadge variant={resOutCfg.variant} dot>{resOutCfg.label}</StatusBadge>}
                                                        {fu.newActionRequired && <StatusBadge variant="high">Yeni Aksiyon Gerekli</StatusBadge>}
                                                    </div>
                                                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                                                        {linkedAction && <Link href={`/actions/${linkedAction.id}`} className="text-orange-600 font-medium hover:underline">{linkedAction.actionId}</Link>}
                                                        {fu.plannedDate && <span>Planlanan: {fmt(fu.plannedDate)}</span>}
                                                        {fu.newFollowUpDate && <span className="text-amber-600">Yeni: {fmt(fu.newFollowUpDate)}</span>}
                                                        <span>{fmtDatetime(fu.createdAt)}</span>
                                                    </div>
                                                </div>
                                                <Button variant="secondary" size="sm" onClick={() => { setSelectedFollowUp(fu); setFollowUpOpen(true); }}>Düzenle</Button>
                                            </div>
                                            <div className="p-5 space-y-3">
                                                {fu.currentStatusDetail && (
                                                    <div>
                                                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Güncel Durum</p>
                                                        <p className="text-sm text-slate-700 bg-amber-50 border border-amber-100 rounded-lg p-3 leading-relaxed">{fu.currentStatusDetail}</p>
                                                    </div>
                                                )}
                                                <div className="grid grid-cols-2 gap-4">
                                                    {fu.birimCevabi && (
                                                        <div>
                                                            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1">Birim Cevabı</p>
                                                            <p className="text-xs text-slate-700 bg-blue-50 border border-blue-100 rounded-lg p-3">{fu.birimCevabi}</p>
                                                        </div>
                                                    )}
                                                    {fu.internalControlAssessment && (
                                                        <div>
                                                            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1">İKS Değerlendirmesi</p>
                                                            <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">{fu.internalControlAssessment}</p>
                                                        </div>
                                                    )}
                                                </div>
                                                {fu.result && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sonuç:</span>
                                                        <StatusBadge variant={fu.result === 'YETERLI' ? 'success' : fu.result === 'YENI_AKSIYON_GEREKLI' ? 'high' : 'critical'} dot>
                                                            {fu.result === 'YETERLI' ? 'Yeterli' : fu.result === 'YENI_AKSIYON_GEREKLI' ? 'Yeni Aksiyon Gerekli' : 'Yetersiz'}
                                                        </StatusBadge>
                                                    </div>
                                                )}
                                                {/* FollowUp attachments */}
                                                {(fu.attachments || []).length > 0 && (
                                                    <FileUpload
                                                        compact
                                                        attachments={(fu.attachments || []).map(toAttachmentMeta)}
                                                        onUpload={(meta) => uploadFollowUpAttachment(fu.id, meta)}
                                                        onRemove={(att) => { if (att.id) removeFollowUpAttachment(fu.id, att.id); }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════ RİSKLER TAB ═══════ */}
                {activeTab === 'riskler' && (
                    <div className="space-y-4">
                        <h2 className="text-sm font-semibold text-slate-700">İlişkili Riskler ({finding.linkedRisks.length})</h2>
                        {finding.linkedRisks.length === 0 ? (
                            <div className="bg-white border border-dashed border-slate-200 rounded-xl">
                                <EmptyState
                                    title="İlişkili risk yok"
                                    description="Bu bulgu herhangi bir riskle ilişkilendirilmemiş."
                                />
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                {finding.linkedRisks.map(r => (
                                    <Link key={r.id} href={`/risks/${r.id}`}
                                        className="bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition-all group">
                                        <div className="flex items-start justify-between mb-2">
                                            <span className="font-mono text-sm font-bold text-blue-700 group-hover:text-blue-900">{r.riskId}</span>
                                            {r.residualRiskScore != null && (
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.residualRiskScore >= 15 ? 'bg-red-100 text-red-700' : r.residualRiskScore >= 8 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                                                    Skor: {r.residualRiskScore}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-slate-700 font-medium">{r.name}</p>
                                        {r.owner && <p className="text-xs text-slate-400 mt-1">Sahip: {r.owner.firstName} {r.owner.lastName}</p>}
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════ EKLER TAB ═══════ */}
                {activeTab === 'ekler' && (
                    <DetailSection title="Bulgu Ekleri">
                        <FileUpload
                            attachments={finding.attachments.map(toAttachmentMeta)}
                            onUpload={uploadFindingAttachment}
                            onRemove={(att) => { if (att.id) removeFindingAttachment(att.id); }}
                            label=""
                        />
                    </DetailSection>
                )}

                {/* ═══════ TARİHÇE TAB ═══════ */}
                {activeTab === 'tarihce' && (
                    <DetailSection title="Denetim İzi (Audit Trail)">
                        <p className="text-xs text-slate-500 mb-5">Bulgu üzerindeki tüm işlemler kronolojik olarak kaydedilmektedir.</p>
                        <Timeline items={timelineItems} emptyText="Henüz kayıt yok." />
                    </DetailSection>
                )}
            </div>

            {/* ── Workflow Dialog ──────────────────────────────────────────────── */}
            {workflowAction && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="px-6 py-5 border-b border-slate-100">
                            <h3 className="text-base font-semibold text-slate-900">
                                {workflowAction === 'mutabakata-gonder'         && 'Mutabakata Gönder'}
                                {workflowAction === 'ic-kontrol-onayina-gonder' && 'İKS Onayına Gönder'}
                                {workflowAction === 'mutabakat-onayla'          && 'Mutabakatı Onayla'}
                                {workflowAction === 'mutabakat-geri-gonder'     && 'Birime Geri Gönder'}
                                {workflowAction === 'iptal-et'                  && 'Bulguyu İptal Et'}
                            </h3>
                        </div>
                        <div className="p-6 space-y-4">
                            {workflowAction === 'mutabakata-gonder' && (
                                <p className="text-sm text-slate-600">Bu bulgu mutabakata gönderilecek ve iletişim kişisine bildirim yapılacak. Onaylıyor musunuz?</p>
                            )}
                            {(workflowAction === 'ic-kontrol-onayina-gonder' || workflowAction === 'mutabakat-onayla') && (
                                <div>
                                    <label className="text-xs font-semibold text-slate-700 uppercase block mb-1.5">
                                        {workflowAction === 'ic-kontrol-onayina-gonder' ? 'Birim Cevabı' : 'İç Kontrol Değerlendirmesi'}
                                    </label>
                                    <textarea value={workflowInput} onChange={e => setWorkflowInput(e.target.value)} rows={4}
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none resize-none"
                                        placeholder="Metni girin…" />
                                </div>
                            )}
                            {(workflowAction === 'mutabakat-geri-gonder' || workflowAction === 'iptal-et') && (
                                <div>
                                    <label className="text-xs font-semibold text-slate-700 uppercase block mb-1.5">Gerekçe *</label>
                                    <textarea value={workflowInput} onChange={e => setWorkflowInput(e.target.value)} rows={3}
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-300 outline-none resize-none"
                                        placeholder="Gerekçeyi yazın…" />
                                </div>
                            )}
                        </div>
                        <div className="px-6 pb-6 flex justify-end gap-3">
                            <Button variant="secondary" size="sm" onClick={() => { setWorkflowAction(null); setWorkflowInput(''); }}>İptal</Button>
                            <Button variant={workflowAction === 'iptal-et' ? 'danger' : 'primary'} size="sm" onClick={submitWorkflow} disabled={workflowLoading}>
                                {workflowLoading ? 'İşleniyor…' : 'Onayla'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modals ────────────────────────────────────────────────────────── */}
            {addActionOpen && (
                <AddActionModal
                    findingId={finding.id}
                    isOpen={addActionOpen}
                    action={editAction}
                    onClose={() => {
                        setAddActionOpen(false);
                        setEditAction(null);
                    }}
                    onSubmit={async (data) => {
                        if (editAction) {
                            await api.updateFindingAction(finding.id, editAction.id, data);
                        } else {
                            await api.createFindingAction(finding.id, data);
                        }
                        load(); setActiveTab('aksiyonlar');
                    }}
                />
            )}

            {followUpOpen && (
                <FindingFollowUpModal
                    findingId={finding.id}
                    followUp={selectedFollowUp}
                    actions={finding.actions}
                    isOpen={followUpOpen}
                    onClose={() => { setFollowUpOpen(false); setSelectedFollowUp(null); }}
                    onSuccess={() => load()}
                />
            )}
        </DetailShell>
    );
}
