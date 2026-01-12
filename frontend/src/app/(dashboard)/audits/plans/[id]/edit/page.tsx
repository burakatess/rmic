'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

// Demo data - same as detail page
const AUDIT_TEAMS = [
    { id: '1', name: 'BT Denetim Ekibi', members: ['Ahmet Yılmaz', 'Ayşe Kaya', 'Mehmet Demir'] },
    { id: '2', name: 'Finansal Denetim Ekibi', members: ['Fatma Öz', 'Can Arslan', 'Elif Şahin'] },
    { id: '3', name: 'Uyum Denetim Ekibi', members: ['Zeynep Şen', 'Ali Veli', 'Kemal Yurt'] },
    { id: '4', name: 'Operasyonel Denetim Ekibi', members: ['Murat Kaya', 'Selin Demir', 'Ece Tan'] },
];

const AUDITABLE_UNITS = [
    'Bilgi Teknolojileri', 'Kredi Tahsis', 'Uyum Birimi', 'Şube Ağı', 'İnsan Kaynakları',
    'Satın Alma', 'Finans', 'Hazine', 'Risk Yönetimi', 'Operasyonlar',
];

const DEMO_AUDIT = {
    id: '1',
    auditCode: 'AP-2024-001',
    auditName: 'Bilgi Güvenliği Yıllık Denetimi',
    auditedUnit: 'Bilgi Teknolojileri',
    selectedTeamId: '1',
    teamLeader: 'Ahmet Yılmaz',
    selectedMembers: ['Ayşe Kaya', 'Mehmet Demir'],
    rationale: 'PERIODIC',
    priority: 'HIGH',
    status: 'COMPLETED',
    phase: 'CLOSED',
    plannedStartDate: '2024-01-15',
    plannedEndDate: '2024-02-15',
    actualStartDate: '2024-01-15',
    actualEndDate: '2024-02-20',
    plannedManDays: 30,
    actualManDays: 35,
    year: 2024,
    period: 'Q1',
    objectives: 'Bilgi güvenliği politikalarının uygulanma durumunun değerlendirilmesi, erişim kontrol mekanizmalarının etkinliğinin test edilmesi, siber güvenlik açıklarının belirlenmesi.',
    scope: 'Ağ güvenliği, kimlik yönetimi, veri şifreleme, yedekleme prosedürleri, olay yönetimi süreçleri, ISO 27001 uyumluluğu.',
};

const PRIORITY_OPTIONS = [
    { value: 'LOW', label: 'Düşük', color: 'bg-green-100 text-green-700 border-green-300' },
    { value: 'MEDIUM', label: 'Orta', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
    { value: 'HIGH', label: 'Yüksek', color: 'bg-red-100 text-red-700 border-red-300' },
];

const STATUS_OPTIONS = [
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

export default function EditAuditPlanPage() {
    const params = useParams();
    const router = useRouter();

    // Initialize with demo data
    const [auditName, setAuditName] = useState(DEMO_AUDIT.auditName);
    const [auditedUnit, setAuditedUnit] = useState(DEMO_AUDIT.auditedUnit);
    const [selectedTeamId, setSelectedTeamId] = useState(DEMO_AUDIT.selectedTeamId);
    const [teamLeader, setTeamLeader] = useState(DEMO_AUDIT.teamLeader);
    const [selectedMembers, setSelectedMembers] = useState<string[]>(DEMO_AUDIT.selectedMembers);
    const [rationale, setRationale] = useState(DEMO_AUDIT.rationale);
    const [priority, setPriority] = useState(DEMO_AUDIT.priority);
    const [status, setStatus] = useState(DEMO_AUDIT.status);
    const [phase, setPhase] = useState(DEMO_AUDIT.phase);
    const [plannedStartDate, setPlannedStartDate] = useState(DEMO_AUDIT.plannedStartDate);
    const [plannedEndDate, setPlannedEndDate] = useState(DEMO_AUDIT.plannedEndDate);
    const [actualStartDate, setActualStartDate] = useState(DEMO_AUDIT.actualStartDate);
    const [actualEndDate, setActualEndDate] = useState(DEMO_AUDIT.actualEndDate);
    const [plannedManDays, setPlannedManDays] = useState(DEMO_AUDIT.plannedManDays.toString());
    const [actualManDays, setActualManDays] = useState(DEMO_AUDIT.actualManDays.toString());
    const [year, setYear] = useState(DEMO_AUDIT.year.toString());
    const [period, setPeriod] = useState(DEMO_AUDIT.period);
    const [objectives, setObjectives] = useState(DEMO_AUDIT.objectives);
    const [scope, setScope] = useState(DEMO_AUDIT.scope);

    const selectedTeam = AUDIT_TEAMS.find(t => t.id === selectedTeamId);
    const availableMembers = selectedTeam?.members || [];

    const handleTeamChange = (teamId: string) => {
        setSelectedTeamId(teamId);
        setTeamLeader('');
        setSelectedMembers([]);
    };

    const toggleMember = (member: string) => {
        if (selectedMembers.includes(member)) {
            setSelectedMembers(prev => prev.filter(m => m !== member));
        } else {
            setSelectedMembers(prev => [...prev, member]);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        alert('Denetim planı güncellendi! (Demo modda API çağrısı yapılmadı)');
        router.push(`/audits/plans/${params.id}`);
    };

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
                        <Link href={`/audits/plans/${params.id}`} className="hover:text-gray-700">{DEMO_AUDIT.auditCode}</Link>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-gray-900">Düzenle</span>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Denetim Planını Düzenle</h1>
                    <p className="text-gray-500 mt-1">{DEMO_AUDIT.auditCode}</p>
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
                                    <option value="PERIODIC">Periyodik</option>
                                    <option value="REGULATORY">Regülatif</option>
                                    <option value="MANAGEMENT_REQUEST">Yönetim Talebi</option>
                                    <option value="RISK_BASED">Risk Bazlı</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Yıl</label>
                                <select value={year} onChange={(e) => setYear(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg">
                                    <option value="2024">2024</option>
                                    <option value="2025">2025</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Dönem</label>
                                <select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg">
                                    <option value="Q1">Q1</option>
                                    <option value="Q2">Q2</option>
                                    <option value="Q3">Q3</option>
                                    <option value="Q4">Q4</option>
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

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Ekip</label>
                                <select value={selectedTeamId} onChange={(e) => handleTeamChange(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg">
                                    {AUDIT_TEAMS.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Ekip Lideri</label>
                                <select value={teamLeader} onChange={(e) => setTeamLeader(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg">
                                    <option value="">Seçin</option>
                                    {availableMembers.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                        </div>

                        {selectedTeamId && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Ekip Üyeleri</label>
                                <div className="flex flex-wrap gap-2">
                                    {availableMembers.filter(m => m !== teamLeader).map(member => (
                                        <button
                                            key={member}
                                            type="button"
                                            onClick={() => toggleMember(member)}
                                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${selectedMembers.includes(member)
                                                    ? 'bg-blue-100 text-blue-700 border-blue-300'
                                                    : 'bg-gray-50 text-gray-600 border-gray-200'
                                                }`}
                                        >
                                            {selectedMembers.includes(member) && '✓ '}{member}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
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
                                <label className="block text-sm font-medium text-gray-700 mb-1">Gerçek Başlangıç</label>
                                <input type="date" value={actualStartDate} onChange={(e) => setActualStartDate(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Gerçek Bitiş</label>
                                <input type="date" value={actualEndDate} onChange={(e) => setActualEndDate(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg" />
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

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                        <Link href={`/audits/plans/${params.id}`} className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900">
                            İptal
                        </Link>
                        <button type="submit" className="px-5 py-2.5 text-sm font-medium text-white bg-[#1e3a5f] rounded-lg hover:bg-[#152a45]">
                            Değişiklikleri Kaydet
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
