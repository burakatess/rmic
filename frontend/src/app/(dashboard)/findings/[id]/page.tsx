'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import { StatusBadge, Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import AddActionModal from '@/components/modals/AddActionModal';
import { FindingFollowUpModal } from '@/components/modals/FindingFollowUpModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Attachment { id: string; originalName: string; mimeType: string; sizeBytes: number; createdAt: string }
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

const severityConfig: Record<string, { label: string; sublabel: string; variant: BV; ring: string }> = {
    CRITICAL: { label: 'KZ', sublabel: 'Kontrol Zayıflığı',            variant: 'critical', ring: 'ring-red-300 bg-red-50 text-red-800' },
    HIGH:     { label: 'KD', sublabel: 'Kayda Değer Kontrol Eksikliği', variant: 'high',     ring: 'ring-orange-300 bg-orange-50 text-orange-800' },
    MEDIUM:   { label: 'ÖK', sublabel: 'Önemli Kontrol Eksikliği',      variant: 'medium',   ring: 'ring-yellow-300 bg-yellow-50 text-yellow-800' },
    LOW:      { label: 'Düşük', sublabel: 'Düşük Önem',                 variant: 'low',      ring: 'ring-green-300 bg-green-50 text-green-800' },
};

const resolutionConfig: Record<string, { label: string; variant: BV }> = {
    DEVAM_EDIYOR:          { label: 'Devam Ediyor',        variant: 'warning' },
    KISMEN_KAPATILDI:      { label: 'Kısmen Kapatıldı',    variant: 'info' },
    KAPATILDI:             { label: 'Kapatıldı',           variant: 'success' },
    ERTELENDI:             { label: 'Ertelendi',           variant: 'neutral' },
    YENI_AKSIYON_GEREKLI:  { label: 'Yeni Aksiyon Gerekli', variant: 'high' },
};

const workflowConfig: Record<string, { label: string; step: number }> = {
    TASLAK:                        { label: 'Taslak',                  step: 1 },
    MUTABAKATA_GONDERILDI:         { label: 'Mutabakata Gönderildi',   step: 2 },
    IC_KONTROL_ONAYINA_GONDERILDI: { label: 'İKS Onayında',           step: 3 },
    MUTABAKAT_YAPILDI:             { label: 'Mutabakat Yapıldı',       step: 4 },
    IPTAL:                         { label: 'İptal',                   step: 0 },
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

const operationLabels: Record<string, { label: string; color: string }> = {
    FINDING_CREATED:     { label: 'Bulgu Oluşturuldu',          color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    FINDING_UPDATED:     { label: 'Bulgu Güncellendi',          color: 'bg-blue-100 text-blue-700 border-blue-200' },
    STATUS_CHANGED:      { label: 'Durum Değişti',              color: 'bg-violet-100 text-violet-700 border-violet-200' },
    ACTION_ADDED:        { label: 'Aksiyon Eklendi',            color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    ACTION_UPDATED:      { label: 'Aksiyon Güncellendi',        color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    ACTION_CLOSED:       { label: 'Aksiyon Kapatıldı',          color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    FOLLOWUP_OPENED:     { label: 'Takip Açıldı',              color: 'bg-amber-100 text-amber-700 border-amber-200' },
    FOLLOWUP_COMPLETED:  { label: 'Takip Sonuçlandırıldı',     color: 'bg-teal-100 text-teal-700 border-teal-200' },
    TEST_DATE_CHANGED:   { label: 'Test Tarihi Değişti',        color: 'bg-sky-100 text-sky-700 border-sky-200' },
    TARGET_DATE_CHANGED: { label: 'Hedef Tarih Değişti',        color: 'bg-sky-100 text-sky-700 border-sky-200' },
    FILE_UPLOADED:       { label: 'Dosya Yüklendi',             color: 'bg-slate-100 text-slate-700 border-slate-200' },
    FILE_DELETED:        { label: 'Dosya Silindi',              color: 'bg-red-100 text-red-700 border-red-200' },
    FINDING_CLOSED:      { label: 'Bulgu Kapatıldı',            color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    FINDING_REOPENED:    { label: 'Bulgu Yeniden Açıldı',       color: 'bg-orange-100 text-orange-700 border-orange-200' },
    WORKFLOW_CHANGE:     { label: 'Akış Değişikliği',           color: 'bg-violet-100 text-violet-700 border-violet-200' },
    RESOLUTION_CHANGED:  { label: 'Çözüm Durumu Güncellendi',  color: 'bg-amber-100 text-amber-700 border-amber-200' },
    ACTION_CREATED:      { label: 'Aksiyon Oluşturuldu',        color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
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

const formatBytes = (b: number) => b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

const mimeIcon = (mime: string) => {
    if (mime.includes('pdf')) return '📄';
    if (mime.includes('word') || mime.includes('docx')) return '📝';
    if (mime.includes('excel') || mime.includes('xlsx') || mime.includes('spreadsheet')) return '📊';
    if (mime.includes('image')) return '🖼️';
    if (mime.includes('zip') || mime.includes('rar')) return '📦';
    return '📎';
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
            <div className="text-sm text-slate-800">{value || <span className="text-slate-300 italic">—</span>}</div>
        </div>
    );
}

function Card({ title, icon, children, action }: { title: string; icon?: string; children: React.ReactNode; action?: React.ReactNode }) {
    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-2">
                    {icon && <span>{icon}</span>}
                    <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
                </div>
                {action}
            </div>
            <div className="p-5">{children}</div>
        </div>
    );
}

// Compact workflow pill — top right
function WorkflowPill({ status, onAction }: { status: string; onAction: (a: string) => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const cfg = workflowConfig[status] || workflowConfig['TASLAK'];
    const isCancelled = status === 'IPTAL';
    const isDone = status === 'MUTABAKAT_YAPILDI';
    const currentStep = cfg.step;

    useEffect(() => {
        const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const steps = [
        { key: 'TASLAK', label: 'Taslak', step: 1 },
        { key: 'MUTABAKATA_GONDERILDI', label: 'Mutabakata Gönderildi', step: 2 },
        { key: 'IC_KONTROL_ONAYINA_GONDERILDI', label: 'İKS Onayında', step: 3 },
        { key: 'MUTABAKAT_YAPILDI', label: 'Mutabakat Yapıldı', step: 4 },
    ];

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(!open)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                    isCancelled ? 'bg-red-50 border-red-200 text-red-700' :
                    isDone      ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                                  'bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100'
                }`}
            >
                <span className={`w-2 h-2 rounded-full ${isCancelled ? 'bg-red-500' : isDone ? 'bg-emerald-500' : 'bg-violet-500 animate-pulse'}`} />
                {cfg.label}
                {!isCancelled && !isDone && <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>}
            </button>

            {open && !isCancelled && (
                <div className="absolute right-0 top-9 z-30 bg-white border border-slate-200 rounded-xl shadow-xl w-72 overflow-hidden">
                    {/* Step progress */}
                    <div className="p-4 border-b border-slate-100 bg-slate-50">
                        <div className="flex items-center gap-1">
                            {steps.map((s, i) => (
                                <div key={s.key} className="flex items-center flex-1 last:flex-none">
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border transition-all ${
                                        currentStep > s.step ? 'bg-emerald-500 border-emerald-500 text-white' :
                                        currentStep === s.step ? 'bg-violet-600 border-violet-600 text-white' :
                                                                  'bg-white border-slate-300 text-slate-400'
                                    }`}>
                                        {currentStep > s.step ? '✓' : s.step}
                                    </div>
                                    {i < steps.length - 1 && <div className={`flex-1 h-px mx-0.5 ${currentStep > s.step ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
                                </div>
                            ))}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2 font-medium">Adım {currentStep}/4 — {cfg.label}</p>
                    </div>
                    {/* Actions */}
                    <div className="p-2 space-y-1">
                        {status === 'TASLAK' && (
                            <button onClick={() => { onAction('mutabakata-gonder'); setOpen(false); }}
                                className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-violet-50 text-violet-700 font-medium flex items-center gap-2">
                                📤 Mutabakata Gönder
                            </button>
                        )}
                        {status === 'MUTABAKATA_GONDERILDI' && (
                            <button onClick={() => { onAction('ic-kontrol-onayina-gonder'); setOpen(false); }}
                                className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-violet-50 text-violet-700 font-medium flex items-center gap-2">
                                ✅ İKS Onayına Gönder
                            </button>
                        )}
                        {status === 'IC_KONTROL_ONAYINA_GONDERILDI' && (
                            <>
                                <button onClick={() => { onAction('mutabakat-onayla'); setOpen(false); }}
                                    className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-emerald-50 text-emerald-700 font-medium flex items-center gap-2">
                                    ✅ Mutabakatı Onayla
                                </button>
                                <button onClick={() => { onAction('mutabakat-geri-gonder'); setOpen(false); }}
                                    className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-amber-50 text-amber-700 font-medium flex items-center gap-2">
                                    ↩ Birime Geri Gönder
                                </button>
                            </>
                        )}
                        {status === 'MUTABAKAT_YAPILDI' && (
                            <p className="px-3 py-2 text-xs text-emerald-600 font-medium">✅ Mutabakat tamamlandı</p>
                        )}
                        <div className="border-t border-slate-100 mt-1 pt-1">
                            <button onClick={() => { onAction('iptal-et'); setOpen(false); }}
                                className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-red-50 text-red-500 flex items-center gap-2">
                                ✕ İptal Et
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Attachment list widget
function AttachmentList({ attachments, onRemove, onAdd, findingId, entityId, entityType }: {
    attachments: Attachment[];
    onRemove?: (id: string) => void;
    onAdd?: () => void;
    findingId: string;
    entityId?: string;
    entityType: 'finding' | 'action' | 'followup';
}) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { success, error: showError } = useToast();

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        for (const file of Array.from(files)) {
            const allowed = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'image/png', 'image/jpeg', 'application/zip', 'application/x-zip-compressed'];
            if (!allowed.includes(file.type)) { showError('Desteklenmeyen Format', `${file.name} — yalnızca PDF, DOCX, XLSX, PNG, JPG, ZIP desteklenir.`); continue; }
            const meta = { fileName: `${Date.now()}-${file.name}`, originalName: file.name, mimeType: file.type, sizeBytes: file.size };
            try {
                if (entityType === 'finding') await api.addFindingAttachment(findingId, meta);
                else if (entityType === 'action' && entityId) await api.addActionAttachment(findingId, entityId, meta);
                else if (entityType === 'followup' && entityId) await api.addFollowUpAttachment(findingId, entityId, meta);
                success('Eklendi', `${file.name} dosya kaydı oluşturuldu.`);
                onAdd?.();
            } catch { showError('Hata', `${file.name} eklenemedi.`); }
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="space-y-2">
            {attachments.length === 0 && <p className="text-xs text-slate-400 italic">Henüz ek yok</p>}
            {attachments.map(att => (
                <div key={att.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base">{mimeIcon(att.mimeType)}</span>
                        <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-700 truncate">{att.originalName}</p>
                            <p className="text-[10px] text-slate-400">{formatBytes(att.sizeBytes)} · {fmt(att.createdAt)}</p>
                        </div>
                    </div>
                    {onRemove && (
                        <button onClick={() => onRemove(att.id)} className="ml-2 p-1 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    )}
                </div>
            ))}
            <div>
                <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg,.zip" onChange={handleFile} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 font-medium px-2 py-1.5 rounded-lg hover:bg-violet-50 transition-colors border border-dashed border-violet-300 w-full justify-center">
                    + Dosya Ekle
                </button>
            </div>
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'detay' | 'aksiyonlar' | 'takip' | 'riskler' | 'ekler' | 'tarihce';

export default function FindingDetailPage() {
    const { id } = useParams<{ id: string }>();
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

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3 text-slate-400">
                <div className="w-8 h-8 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
                <span className="text-sm">Yükleniyor…</span>
            </div>
        </div>
    );

    if (!finding) return <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Bulgu bulunamadı.</div>;

    const typeCfg = findingTypeConfig[finding.findingType || ''];
    const sevCfg = severityConfig[finding.severity] || { label: finding.severity, sublabel: '', variant: 'neutral' as BV, ring: 'ring-slate-200 bg-slate-50 text-slate-700' };
    const resCfg = resolutionConfig[finding.resolutionStatus] || resolutionConfig['DEVAM_EDIYOR'];
    const daysLeft = getDaysLeft(finding.targetResolutionDate);
    const isOverdue = finding.resolutionStatus !== 'KAPATILDI' && daysLeft !== null && daysLeft < 0;
    const isApproaching = finding.resolutionStatus !== 'KAPATILDI' && daysLeft !== null && daysLeft >= 0 && daysLeft <= 14;

    const tabs: { id: Tab; label: string; count?: number }[] = [
        { id: 'detay',      label: 'Bulgu Detayı' },
        { id: 'aksiyonlar', label: 'Aksiyonlar',          count: finding._count?.actions },
        { id: 'takip',      label: 'Takip Çalışmaları',   count: finding._count?.followUps },
        { id: 'riskler',    label: 'İlişkili Riskler',    count: finding._count?.linkedRisks },
        { id: 'ekler',      label: 'Ekler',               count: finding._count?.attachments },
        { id: 'tarihce',    label: 'Tarihçe',             count: auditTrail.length },
    ];

    return (
        <div className="min-h-full bg-slate-50/60">

            {/* ── Sticky Header ──────────────────────────────────────────────── */}
            <div className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
                <div className="px-8 py-4">
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
                        <Link href="/findings" className="hover:text-violet-600">Bulgu Envanteri</Link>
                        <span>/</span>
                        <span className="text-slate-700 font-semibold font-mono">{finding.findingId}</span>
                    </div>

                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                            {/* Severity badge */}
                            <div className={`flex-shrink-0 w-11 h-11 rounded-xl flex flex-col items-center justify-center ring-2 ${sevCfg.ring}`}>
                                <span className="text-sm font-black leading-none">{sevCfg.label}</span>
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="font-mono text-xs font-bold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-md">{finding.findingId}</span>
                                    {typeCfg && <StatusBadge variant={typeCfg.variant}>{typeCfg.label}</StatusBadge>}
                                    <StatusBadge variant={resCfg.variant} dot>{resCfg.label}</StatusBadge>
                                    {isOverdue && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full border border-red-200 animate-pulse">⚠ {Math.abs(daysLeft!)} gün gecikmiş</span>}
                                    {isApproaching && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full border border-amber-200">⏰ {daysLeft} gün kaldı</span>}
                                </div>
                                <h1 className="text-base font-bold text-slate-900 truncate max-w-2xl leading-tight">
                                    {finding.summary || finding.description}
                                </h1>
                                <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
                                    {finding.relatedDepartment && <span>📍 {finding.relatedDepartment}</span>}
                                    {finding.gmy && <span>👤 {finding.gmy}</span>}
                                    {finding.iletisimKisisi && <span>📞 {finding.iletisimKisisi}</span>}
                                    {finding.targetResolutionDate && (
                                        <span className={isOverdue ? 'text-red-500 font-semibold' : ''}>
                                            🎯 {fmt(finding.targetResolutionDate)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                            <WorkflowPill status={finding.workflowStatus} onAction={setWorkflowAction} />
                            <Link href={`/findings/${id}/edit`}>
                                <Button variant="secondary" size="sm">✏️ Düzenle</Button>
                            </Link>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex items-center gap-0 mt-3 -mb-4 border-b border-transparent">
                        {tabs.map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
                                    activeTab === tab.id ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                                }`}
                            >
                                {tab.label}
                                {tab.count !== undefined && (
                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === tab.id ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Content ────────────────────────────────────────────────────── */}
            <div className="px-8 py-6 space-y-5">

                {/* ═══════ DETAY TAB ═══════ */}
                {activeTab === 'detay' && (
                    <div className="space-y-5">
                        {/* Bulgu Metni / Özeti — üstte prominence card */}
                        <div className="bg-white border-l-4 border-violet-500 rounded-xl shadow-sm p-6">
                            {finding.summary && (
                                <div className="mb-4">
                                    <p className="text-[10px] font-bold text-violet-500 uppercase tracking-widest mb-1.5">Bulgu Özeti</p>
                                    <p className="text-base font-semibold text-slate-900 leading-snug">{finding.summary}</p>
                                </div>
                            )}
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Bulgu Metni</p>
                                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{finding.description}</p>
                            </div>
                            {finding.recommendation && (
                                <div className="mt-4 pt-4 border-t border-slate-100">
                                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1.5">💡 Öneri / Düzeltici Faaliyet</p>
                                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{finding.recommendation}</p>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-3 gap-5">
                            <div className="col-span-2 space-y-5">
                                {/* Kimlik Bilgileri */}
                                <Card title="Kimlik & Sınıflandırma" icon="🏷️">
                                    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                                        <InfoRow label="Bulgu No" value={<span className="font-mono font-bold text-violet-700">{finding.findingId}</span>} />
                                        <InfoRow label="Bulgu Türü" value={typeCfg ? <StatusBadge variant={typeCfg.variant}>{typeCfg.label}</StatusBadge> : finding.findingType} />
                                        <InfoRow label="Önem Derecesi" value={
                                            <span className="flex items-center gap-2">
                                                <StatusBadge variant={sevCfg.variant}>{sevCfg.label}</StatusBadge>
                                                <span className="text-xs text-slate-500">{sevCfg.sublabel}</span>
                                            </span>
                                        } />
                                        <InfoRow label="Çözüm Durumu" value={<StatusBadge variant={resCfg.variant} dot>{resCfg.label}</StatusBadge>} />
                                    </div>
                                </Card>

                                {/* Sorumluluk */}
                                <Card title="Sorumluluk & Organizasyon" icon="🏢">
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
                                </Card>

                                {/* Tarihler */}
                                <Card title="Tarihler" icon="📅">
                                    <div className="grid grid-cols-3 gap-x-8 gap-y-4">
                                        <InfoRow label="Bulgu Test Tarihi" value={fmt(finding.testDate)} />
                                        <InfoRow label="Hedef Tamamlanma" value={
                                            <span className={isOverdue ? 'text-red-600 font-semibold' : isApproaching ? 'text-amber-600 font-semibold' : ''}>
                                                {fmt(finding.targetResolutionDate)}
                                                {isOverdue && ' ⚠'}{isApproaching && ' ⏰'}
                                            </span>
                                        } />
                                        {finding.closedDate && <InfoRow label="Kapanma Tarihi" value={<span className="text-emerald-700 font-semibold">{fmt(finding.closedDate)}</span>} />}
                                        <InfoRow label="Kayıt Tarihi" value={fmt(finding.createdAt)} />
                                        <InfoRow label="Son Güncelleme" value={fmt(finding.updatedAt)} />
                                    </div>
                                </Card>
                            </div>

                            <div className="space-y-5">
                                {/* Güncel Durum Log */}
                                <Card title="Bulgunun Güncel Durumu" icon="📊">
                                    <div className="space-y-3">
                                        {finding.statusLogs.length === 0 && <p className="text-xs text-slate-400 italic">Henüz güncelleme yok</p>}
                                        <div className="space-y-2 max-h-48 overflow-y-auto">
                                            {finding.statusLogs.map(log => (
                                                <div key={log.id} className="text-xs border-l-2 border-violet-200 pl-3 py-1">
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
                                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-violet-300 outline-none resize-none"
                                            />
                                            <Button size="sm" variant="primary" onClick={addLog} disabled={logSaving || !logText.trim()} className="w-full">
                                                {logSaving ? '…' : '+ Not Ekle'}
                                            </Button>
                                        </div>
                                    </div>
                                </Card>

                                {/* Birim Cevabı & İKS Değerlendirmesi */}
                                {finding.birimCevabi && (
                                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">Birim Cevabı</p>
                                        <p className="text-xs text-slate-700 leading-relaxed">{finding.birimCevabi}</p>
                                    </div>
                                )}
                                {finding.internalControlAssessment && (
                                    <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                                        <p className="text-[10px] font-bold text-violet-600 uppercase tracking-widest mb-2">İç Kontrol Değerlendirmesi</p>
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
                                <h2 className="text-base font-semibold text-slate-800">Düzeltici Aksiyonlar</h2>
                                <p className="text-xs text-slate-500 mt-0.5">Aksiyon tamamlanma tarihine göre sistem otomatik Takip Çalışması oluşturur. Bulgunun hedef tarihi, en ileri aksiyona göre hesaplanır.</p>
                            </div>
                            <Button variant="primary" size="sm" onClick={() => setAddActionOpen(true)}
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
                            >Yeni Aksiyon</Button>
                        </div>

                        {finding.actions.length === 0 ? (
                            <div className="bg-white border border-dashed border-slate-200 rounded-xl p-10 text-center">
                                <div className="text-3xl mb-2">⚡</div>
                                <p className="text-sm font-medium text-slate-600">Henüz aksiyon yok</p>
                                <p className="text-xs text-slate-400 mt-1 mb-3">Düzeltici bir aksiyon tanımlayın</p>
                                <Button variant="primary" size="sm" onClick={() => setAddActionOpen(true)}>+ Aksiyon Ekle</Button>
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
                                                <div className="flex-shrink-0 w-10 h-10 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-center">
                                                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                                            <button
                                                                onClick={() => {
                                                                    setEditAction(action);
                                                                    setAddActionOpen(true);
                                                                }}
                                                                className="text-xs text-indigo-600 hover:text-indigo-800 font-bold bg-indigo-50 hover:bg-indigo-100/80 px-2.5 py-1 rounded transition-colors flex items-center gap-1 shadow-sm border border-indigo-200/50"
                                                            >
                                                                ✏️ Düzenle
                                                            </button>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-slate-800 leading-relaxed mb-3">{action.description}</p>
                                                    <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                                                        {action.owner && <span>👤 {action.owner.firstName} {action.owner.lastName}</span>}
                                                        {action.responsibleDepartment && <span>🏢 {action.responsibleDepartment}</span>}
                                                        <span className={aOverdue ? 'text-red-600 font-semibold' : ''}>🎯 {fmt(action.dueDate)}</span>
                                                        {action.completedAt && <span className="text-emerald-600">✅ Kapandı: {fmt(action.completedAt)}</span>}
                                                    </div>
                                                    {action.notes && <p className="text-xs text-slate-500 mt-2 bg-slate-50 rounded-lg p-2 border border-slate-100">{action.notes}</p>}
                                                </div>
                                            </div>
                                            {/* Action attachments */}
                                            {(action.attachments && action.attachments.length > 0 || true) && (
                                                <div className="px-5 pb-4 border-t border-slate-100 pt-3">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Ekler</p>
                                                    <AttachmentList
                                                        attachments={action.attachments || []}
                                                        findingId={finding.id}
                                                        entityId={action.id}
                                                        entityType="action"
                                                        onRemove={(attId) => removeActionAttachment(action.id, attId)}
                                                        onAdd={() => load()}
                                                    />
                                                </div>
                                            )}
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
                                                                    className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 hover:bg-violet-50 border border-slate-200 hover:border-violet-300 rounded-lg text-xs transition-all">
                                                                    <span className="font-mono text-violet-700 font-semibold">{fu.followUpId}</span>
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
                                <h2 className="text-base font-semibold text-slate-800">Bulgu Takip Çalışmaları</h2>
                                <p className="text-xs text-slate-500 mt-0.5">Aksiyonlar oluşturulunca otomatik açılır. Takip sonucu ana bulguda güncellenir (append-only log).</p>
                            </div>
                            <Button variant="secondary" size="sm" onClick={() => { setSelectedFollowUp(null); setFollowUpOpen(true); }}>
                                + Manuel Takip
                            </Button>
                        </div>

                        {finding.followUps.length === 0 ? (
                            <div className="bg-white border border-dashed border-slate-200 rounded-xl p-10 text-center">
                                <div className="text-3xl mb-2">🔍</div>
                                <p className="text-sm font-medium text-slate-600">Henüz takip çalışması yok</p>
                                <p className="text-xs text-slate-400 mt-1">Aksiyon eklediğinizde otomatik oluşturulur</p>
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
                                                        <Link href={`/follow-ups/${fu.id}`} className="font-mono text-sm font-bold text-violet-700 hover:underline">{fu.followUpId}</Link>
                                                        <StatusBadge variant={fuCfg.variant}>{fuCfg.label}</StatusBadge>
                                                        {resOutCfg && <StatusBadge variant={resOutCfg.variant} dot>{resOutCfg.label}</StatusBadge>}
                                                        {fu.newActionRequired && <StatusBadge variant="high">⚡ Yeni Aksiyon Gerekli</StatusBadge>}
                                                    </div>
                                                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                                                        {linkedAction && <Link href={`/actions/${linkedAction.id}`} className="text-orange-600 font-medium hover:underline">⚡ {linkedAction.actionId}</Link>}
                                                        {fu.plannedDate && <span>📅 Planlanan: {fmt(fu.plannedDate)}</span>}
                                                        {fu.newFollowUpDate && <span className="text-amber-600">↩ Yeni: {fmt(fu.newFollowUpDate)}</span>}
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
                                                            <p className="text-[10px] font-bold text-violet-600 uppercase tracking-widest mb-1">İKS Değerlendirmesi</p>
                                                            <p className="text-xs text-slate-700 bg-violet-50 border border-violet-100 rounded-lg p-3">{fu.internalControlAssessment}</p>
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
                                                    <div>
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Ekler</p>
                                                        <AttachmentList
                                                            attachments={fu.attachments || []}
                                                            findingId={finding.id}
                                                            entityId={fu.id}
                                                            entityType="followup"
                                                            onRemove={(attId) => removeFollowUpAttachment(fu.id, attId)}
                                                            onAdd={() => load()}
                                                        />
                                                    </div>
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
                        <h2 className="text-base font-semibold text-slate-800">İlişkili Riskler ({finding.linkedRisks.length})</h2>
                        {finding.linkedRisks.length === 0 ? (
                            <div className="bg-white border border-dashed border-slate-200 rounded-xl p-10 text-center">
                                <p className="text-sm text-slate-400">Bu bulgu herhangi bir riskle ilişkilendirilmemiş.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                {finding.linkedRisks.map(r => (
                                    <Link key={r.id} href={`/risks/${r.id}`}
                                        className="bg-white border border-slate-200 rounded-xl p-4 hover:border-violet-300 hover:shadow-md transition-all group">
                                        <div className="flex items-start justify-between mb-2">
                                            <span className="font-mono text-sm font-bold text-violet-700 group-hover:text-violet-900">{r.riskId}</span>
                                            {r.residualRiskScore != null && (
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.residualRiskScore >= 15 ? 'bg-red-100 text-red-700' : r.residualRiskScore >= 8 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                                                    Skor: {r.residualRiskScore}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-slate-700 font-medium">{r.name}</p>
                                        {r.owner && <p className="text-xs text-slate-400 mt-1">👤 {r.owner.firstName} {r.owner.lastName}</p>}
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════ EKLER TAB ═══════ */}
                {activeTab === 'ekler' && (
                    <div className="space-y-4">
                        <h2 className="text-base font-semibold text-slate-800">Bulgu Ekleri</h2>
                        <div className="bg-white border border-slate-200 rounded-xl p-5">
                            <AttachmentList
                                attachments={finding.attachments}
                                findingId={finding.id}
                                entityType="finding"
                                onRemove={removeFindingAttachment}
                                onAdd={() => load()}
                            />
                        </div>
                    </div>
                )}

                {/* ═══════ TARİHÇE TAB ═══════ */}
                {activeTab === 'tarihce' && (
                    <div className="space-y-4">
                        <h2 className="text-base font-semibold text-slate-800">Denetim İzi (Audit Trail)</h2>
                        <p className="text-xs text-slate-500">Bulgu üzerindeki tüm işlemler kronolojik olarak kaydedilmektedir.</p>
                        {auditTrail.length === 0 ? (
                            <div className="bg-white border border-dashed border-slate-200 rounded-xl p-10 text-center">
                                <p className="text-sm text-slate-400">Henüz kayıt yok.</p>
                            </div>
                        ) : (
                            <div className="relative">
                                <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-200" />
                                <div className="space-y-3">
                                    {auditTrail.map(entry => {
                                        const op = entry.operation || entry.changeType;
                                        const opCfg = op ? operationLabels[op] : null;
                                        return (
                                            <div key={entry.id} className="flex gap-4">
                                                <div className="relative flex-shrink-0 ml-3.5">
                                                    <div className={`w-3 h-3 rounded-full mt-1.5 border-2 border-white ring-2 ring-slate-200 ${opCfg ? 'bg-violet-500' : 'bg-slate-400'}`} />
                                                </div>
                                                <div className="flex-1 pb-3">
                                                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                                                        <div className="flex items-start justify-between gap-2 mb-2">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                {opCfg ? (
                                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${opCfg.color}`}>{opCfg.label}</span>
                                                                ) : op && (
                                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-600 border-slate-200">{op}</span>
                                                                )}
                                                                {entry.workflowStatus && (
                                                                    <span className="text-xs text-slate-500">
                                                                        {entry.previousWorkflowStatus && <span className="text-slate-400">{workflowConfig[entry.previousWorkflowStatus]?.label || entry.previousWorkflowStatus} → </span>}
                                                                        <span className="font-semibold text-violet-700">{workflowConfig[entry.workflowStatus]?.label || entry.workflowStatus}</span>
                                                                    </span>
                                                                )}
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
                                                            </div>
                                                            <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">{fmtDatetime(entry.entryDate)}</span>
                                                        </div>
                                                        {entry.explanation && <p className="text-xs text-slate-700 leading-relaxed">{entry.explanation}</p>}
                                                        {entry.fieldName && (
                                                            <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
                                                                <span className="font-semibold">{entry.fieldName}:</span>
                                                                {entry.oldValue != null && <span className="line-through text-red-400">{JSON.stringify(entry.oldValue)}</span>}
                                                                {entry.newValue != null && <span className="text-emerald-600 font-medium">→ {JSON.stringify(entry.newValue)}</span>}
                                                            </div>
                                                        )}
                                                        {(entry.evaluator || entry.userId) && (
                                                            <p className="text-[10px] text-slate-400 mt-1.5">👤 {entry.evaluator || entry.userId}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Workflow Dialog ──────────────────────────────────────────────── */}
            {workflowAction && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="px-6 py-5 border-b border-slate-100">
                            <h3 className="text-base font-semibold text-slate-900">
                                {workflowAction === 'mutabakata-gonder'         && '📤 Mutabakata Gönder'}
                                {workflowAction === 'ic-kontrol-onayina-gonder' && '✅ İKS Onayına Gönder'}
                                {workflowAction === 'mutabakat-onayla'          && '✅ Mutabakatı Onayla'}
                                {workflowAction === 'mutabakat-geri-gonder'     && '↩ Birime Geri Gönder'}
                                {workflowAction === 'iptal-et'                  && '✕ Bulguyu İptal Et'}
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
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-300 outline-none resize-none"
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
        </div>
    );
}
