'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { LoadingState, ErrorState } from '@/components/ui';
import { api } from '@/lib/api';

const AUDITABLE_UNITS = [
    'Bilgi Teknolojileri', 'Kredi Tahsis', 'Uyum Birimi', 'Şube Ağı', 'İnsan Kaynakları',
    'Satın Alma', 'Finans', 'Hazine', 'Risk Yönetimi', 'Operasyonlar', 'Pazarlama',
];

const PRIORITY_OPTIONS = [
    { value: 'LOW', label: 'Düşük', color: 'bg-green-100 text-green-700 border-green-300' },
    { value: 'MEDIUM', label: 'Orta', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
    { value: 'HIGH', label: 'Yüksek', color: 'bg-red-100 text-red-700 border-red-300' },
];

const STATUS_OPTIONS = [
    { value: 'DRAFT', label: 'Taslak' },
    { value: 'APPROVED', label: 'Onaylandı' },
    { value: 'PLANNED', label: 'Planlandı' },
    { value: 'IN_PROGRESS', label: 'Devam Ediyor' },
    { value: 'COMPLETED', label: 'Tamamlandı' },
    { value: 'CANCELLED', label: 'İptal' },
];

const PHASE_OPTIONS = [
    { value: 'PLANNING', label: 'Planlama' },
    { value: 'FIELDWORK', label: 'Saha Çalışması' },
    { value: 'REPORTING', label: 'Raporlama' },
    { value: 'CLOSED', label: 'Kapatıldı' },
];

const RATIONALE_OPTIONS = [
    { value: 'PERIODIC', label: 'Periyodik' },
    { value: 'REGULATORY', label: 'Regülatif' },
    { value: 'MANAGEMENT_REQUEST', label: 'Yönetim Talebi' },
    { value: 'RISK_BASED', label: 'Risk Bazlı' },
];

const toDateInput = (v: string | null) => (v ? v.slice(0, 10) : '');

export default function EditAuditPlanPage() {
    const params = useParams();
    const router = useRouter();
    const planId = params.id as string;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [planCode, setPlanCode] = useState('');

    const [auditName, setAuditName] = useState('');
    const [auditedUnit, setAuditedUnit] = useState('');
    const [auditTeam, setAuditTeam] = useState('');
    const [teamLeader, setTeamLeader] = useState('');
    const [teamSize, setTeamSize] = useState('');
    const [rationale, setRationale] = useState('PERIODIC');
    const [priority, setPriority] = useState('MEDIUM');
    const [status, setStatus] = useState('PLANNED');
    const [phase, setPhase] = useState('PLANNING');
    const [plannedStartDate, setPlannedStartDate] = useState('');
    const [plannedEndDate, setPlannedEndDate] = useState('');
    const [draftReportDate, setDraftReportDate] = useState('');
    const [finalReportDate, setFinalReportDate] = useState('');
    const [plannedManDays, setPlannedManDays] = useState('');
    const [actualManDays, setActualManDays] = useState('');
    const [objectives, setObjectives] = useState('');
    const [scope, setScope] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const plan: any = await api.getAuditPlan(planId);
            setPlanCode(plan.planId);
            setAuditName(plan.name || '');
            setAuditedUnit(plan.auditedUnit || '');
            setAuditTeam(plan.auditTeam || '');
            setTeamLeader(plan.teamLeader || '');
            setTeamSize(plan.teamSize?.toString() || '');
            setRationale(plan.rationale || 'PERIODIC');
            setPriority(plan.priority || 'MEDIUM');
            setStatus(plan.status || 'PLANNED');
            setPhase(plan.phase || 'PLANNING');
            setPlannedStartDate(toDateInput(plan.plannedStartDate));
            setPlannedEndDate(toDateInput(plan.plannedEndDate));
            setDraftReportDate(toDateInput(plan.draftReportDate));
            setFinalReportDate(toDateInput(plan.finalReportDate));
            setPlannedManDays(plan.plannedManDays?.toString() || '');
            setActualManDays(plan.actualManDays?.toString() || '');
            setObjectives(plan.objectives || '');
            setScope(plan.scope || '');
        } catch {
            setError('Denetim planı yüklenemedi.');
        } finally {
            setLoading(false);
        }
    }, [planId]);

    useEffect(() => { load(); }, [load]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaveError(null);
        setSaving(true);
        try {
            await api.updateAuditPlan(planId, {
                name: auditName,
                auditedUnit,
                auditTeam,
                teamLeader,
                teamSize: teamSize ? parseInt(teamSize, 10) : null,
                rationale,
                priority,
                status,
                phase,
                plannedStartDate: plannedStartDate ? new Date(plannedStartDate).toISOString() : null,
                plannedEndDate: plannedEndDate ? new Date(plannedEndDate).toISOString() : null,
                draftReportDate: draftReportDate ? new Date(draftReportDate).toISOString() : null,
                finalReportDate: finalReportDate ? new Date(finalReportDate).toISOString() : null,
                plannedManDays: plannedManDays ? parseInt(plannedManDays, 10) : null,
                actualManDays: actualManDays ? parseInt(actualManDays, 10) : null,
                objectives,
                scope,
            });
            router.push(`/audits/plans/${planId}`);
        } catch (err: any) {
            setSaveError(err?.body?.message || 'Denetim planı güncellenemedi.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <LoadingState />;
    if (error) return <ErrorState description={error} onRetry={load} />;

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-4xl mx-auto px-6 py-6">
                {/* Header */}
                <div className="mb-6">
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                        <Link href="/audits/plans" className="hover:text-gray-700">Denetim Planları</Link>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <Link href={`/audits/plans/${planId}`} className="hover:text-gray-700">{planCode}</Link>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-gray-900">Düzenle</span>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Denetim Planını Düzenle</h1>
                    <p className="text-gray-500 mt-1">{planCode}</p>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Basic Information */}
                    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Temel Bilgiler</h2>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Denetim Adı</label>
                                <input
                                    type="text"
                                    value={auditName}
                                    onChange={(e) => setAuditName(e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Denetlenen Birim</label>
                                <select
                                    value={auditedUnit}
                                    onChange={(e) => setAuditedUnit(e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg"
                                >
                                    <option value="">Birim seçin</option>
                                    {AUDITABLE_UNITS.map(unit => (
                                        <option key={unit} value={unit}>{unit}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Gerekçe</label>
                                <select
                                    value={rationale}
                                    onChange={(e) => setRationale(e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg"
                                >
                                    {RATIONALE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Status & Phase */}
                    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Durum Bilgileri</h2>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Durum</label>
                                <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg">
                                    {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Faz</label>
                                <select value={phase} onChange={(e) => setPhase(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg">
                                    {PHASE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Öncelik</label>
                            <div className="flex gap-3">
                                {PRIORITY_OPTIONS.map(opt => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setPriority(opt.value)}
                                        className={`flex-1 py-2.5 px-4 rounded-lg border-2 text-center font-medium transition-all ${priority === opt.value
                                                ? opt.color + ' border-current'
                                                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Team Assignment */}
                    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Denetim Ekibi</h2>

                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Ekip</label>
                                <input type="text" value={auditTeam} onChange={(e) => setAuditTeam(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Ekip Lideri</label>
                                <input type="text" value={teamLeader} onChange={(e) => setTeamLeader(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Ekip Büyüklüğü</label>
                                <input type="number" min="1" value={teamSize} onChange={(e) => setTeamSize(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg" />
                            </div>
                        </div>
                    </div>

                    {/* Schedule */}
                    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Takvim ve Kaynak</h2>

                        <div className="grid grid-cols-4 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Planlanan Başlangıç</label>
                                <input type="date" value={plannedStartDate} onChange={(e) => setPlannedStartDate(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Planlanan Bitiş</label>
                                <input type="date" value={plannedEndDate} onChange={(e) => setPlannedEndDate(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Taslak Rapor Tarihi</label>
                                <input type="date" value={draftReportDate} onChange={(e) => setDraftReportDate(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Final Rapor Tarihi</label>
                                <input type="date" value={finalReportDate} onChange={(e) => setFinalReportDate(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Planlanan Adam-Gün</label>
                                <input type="number" value={plannedManDays} onChange={(e) => setPlannedManDays(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Gerçekleşen Adam-Gün</label>
                                <input type="number" value={actualManDays} onChange={(e) => setActualManDays(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg" />
                            </div>
                        </div>
                    </div>

                    {/* Objectives & Scope */}
                    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Hedefler ve Kapsam</h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Denetim Hedefleri</label>
                                <textarea value={objectives} onChange={(e) => setObjectives(e.target.value)} rows={3} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg resize-none" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Denetim Kapsamı</label>
                                <textarea value={scope} onChange={(e) => setScope(e.target.value)} rows={3} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg resize-none" />
                            </div>
                        </div>
                    </div>

                    {saveError && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
                            {saveError}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                        <Link href={`/audits/plans/${planId}`} className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900">
                            İptal
                        </Link>
                        <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm font-medium text-white bg-[#1e3a5f] rounded-lg hover:bg-[#152a45] disabled:opacity-50">
                            {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
