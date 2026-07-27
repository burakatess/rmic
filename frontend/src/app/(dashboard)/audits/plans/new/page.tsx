'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

// Demo data for dropdowns
const AUDIT_TEAMS = [
    { id: '1', name: 'BT Denetim Ekibi', members: ['Ahmet Yılmaz', 'Ayşe Kaya', 'Mehmet Demir'] },
    { id: '2', name: 'Finansal Denetim Ekibi', members: ['Fatma Öz', 'Can Arslan', 'Elif Şahin'] },
    { id: '3', name: 'Uyum Denetim Ekibi', members: ['Zeynep Şen', 'Ali Veli', 'Kemal Yurt'] },
    { id: '4', name: 'Operasyonel Denetim Ekibi', members: ['Murat Kaya', 'Selin Demir', 'Ece Tan'] },
    { id: '5', name: 'HR Denetim Ekibi', members: ['Deniz Yıldız', 'Burak Aydın'] },
];

const AUDITABLE_UNITS = [
    'Bilgi Teknolojileri', 'Kredi Tahsis', 'Uyum Birimi', 'Şube Ağı', 'İnsan Kaynakları',
    'Satın Alma', 'Finans', 'Hazine', 'Risk Yönetimi', 'Operasyonlar', 'Pazarlama',
];

const RATIONALE_OPTIONS = [
    { value: 'PERIODIC', label: 'Periyodik Denetim' },
    { value: 'REGULATORY', label: 'Regülatif Gereksinim' },
    { value: 'MANAGEMENT_REQUEST', label: 'Yönetim Talebi' },
    { value: 'RISK_BASED', label: 'Risk Bazlı' },
];

const PRIORITY_OPTIONS = [
    { value: 'LOW', label: 'Düşük', color: 'bg-green-100 text-green-700 border-green-300' },
    { value: 'MEDIUM', label: 'Orta', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
    { value: 'HIGH', label: 'Yüksek', color: 'bg-red-100 text-red-700 border-red-300' },
];

const PERIOD_TYPE_MAP: Record<string, string> = {
    Q1: 'QUARTERLY', Q2: 'QUARTERLY', Q3: 'QUARTERLY', Q4: 'QUARTERLY',
    H1: 'SEMI_ANNUAL', H2: 'SEMI_ANNUAL', FULL: 'ANNUAL',
};

export default function NewAuditPlanPage() {
    const router = useRouter();
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    // Form state
    const [auditName, setAuditName] = useState('');
    const [auditedUnit, setAuditedUnit] = useState('');
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [teamLeader, setTeamLeader] = useState('');
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [rationale, setRationale] = useState('PERIODIC');
    const [priority, setPriority] = useState('MEDIUM');
    const [plannedStartDate, setPlannedStartDate] = useState('');
    const [plannedEndDate, setPlannedEndDate] = useState('');
    const [plannedManDays, setPlannedManDays] = useState('');
    const [objectives, setObjectives] = useState('');
    const [scope, setScope] = useState('');
    const [year, setYear] = useState(new Date().getFullYear().toString());
    const [period, setPeriod] = useState('Q1');

    // Get selected team members
    const selectedTeam = AUDIT_TEAMS.find(t => t.id === selectedTeamId);
    const availableMembers = selectedTeam?.members || [];

    // Handle team change
    const handleTeamChange = (teamId: string) => {
        setSelectedTeamId(teamId);
        setTeamLeader('');
        setSelectedMembers([]);
    };

    // Toggle member selection
    const toggleMember = (member: string) => {
        if (selectedMembers.includes(member)) {
            setSelectedMembers(prev => prev.filter(m => m !== member));
        } else {
            setSelectedMembers(prev => [...prev, member]);
        }
    };

    // Calculate estimated man-days based on dates
    const calculateManDays = () => {
        if (plannedStartDate && plannedEndDate) {
            const start = new Date(plannedStartDate);
            const end = new Date(plannedEndDate);
            const diffTime = Math.abs(end.getTime() - start.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            // Assuming 5 working days per week
            const workingDays = Math.floor(diffDays * 5 / 7);
            return workingDays;
        }
        return 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        setSubmitting(true);
        try {
            await api.createAuditPlan({
                name: auditName,
                year: parseInt(year, 10),
                periodType: PERIOD_TYPE_MAP[period] || 'ANNUAL',
                objectives: objectives || '',
                scope: scope || '',
                status: 'PLANNED',
                auditedUnit,
                auditTeam: selectedTeam?.name || null,
                teamLeader: teamLeader || null,
                teamSize: teamLeader ? selectedMembers.length + 1 : selectedMembers.length,
                rationale,
                priority,
                plannedStartDate: plannedStartDate ? new Date(plannedStartDate).toISOString() : null,
                plannedEndDate: plannedEndDate ? new Date(plannedEndDate).toISOString() : null,
                plannedManDays: plannedManDays ? parseInt(plannedManDays, 10) : calculateManDays() || null,
            });
            router.push('/audits/plans');
        } catch (err: any) {
            setSubmitError(err?.body?.message || 'Denetim planı oluşturulamadı.');
        } finally {
            setSubmitting(false);
        }
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
                        <span className="text-gray-900">Yeni Plan</span>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Yeni Denetim Planı Oluştur</h1>
                    <p className="text-gray-500 mt-1">İç denetim planı bilgilerini girin</p>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Basic Information */}
                    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Temel Bilgiler</h2>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Denetim Adı <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={auditName}
                                    onChange={(e) => setAuditName(e.target.value)}
                                    placeholder="ör: Bilgi Güvenliği Yıllık Denetimi"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Denetlenen Birim <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={auditedUnit}
                                    onChange={(e) => setAuditedUnit(e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    required
                                >
                                    <option value="">Birim seçin</option>
                                    {AUDITABLE_UNITS.map(unit => (
                                        <option key={unit} value={unit}>{unit}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Denetim Gerekçesi <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={rationale}
                                    onChange={(e) => setRationale(e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    required
                                >
                                    {RATIONALE_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Yıl
                                </label>
                                <select
                                    value={year}
                                    onChange={(e) => setYear(e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="2024">2024</option>
                                    <option value="2025">2025</option>
                                    <option value="2026">2026</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Dönem
                                </label>
                                <select
                                    value={period}
                                    onChange={(e) => setPeriod(e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="Q1">Q1 (Ocak-Mart)</option>
                                    <option value="Q2">Q2 (Nisan-Haziran)</option>
                                    <option value="Q3">Q3 (Temmuz-Eylül)</option>
                                    <option value="Q4">Q4 (Ekim-Aralık)</option>
                                    <option value="H1">H1 (İlk Yarıyıl)</option>
                                    <option value="H2">H2 (İkinci Yarıyıl)</option>
                                    <option value="FULL">Tam Yıl</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Priority Selection */}
                    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Öncelik</h2>
                        <div className="flex gap-3">
                            {PRIORITY_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setPriority(opt.value)}
                                    className={`flex-1 py-3 px-4 rounded-lg border-2 text-center font-medium transition-all ${priority === opt.value
                                            ? opt.color + ' border-current'
                                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Team Assignment */}
                    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Denetim Ekibi</h2>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Denetim Ekibi <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={selectedTeamId}
                                    onChange={(e) => handleTeamChange(e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    required
                                >
                                    <option value="">Ekip seçin</option>
                                    {AUDIT_TEAMS.map(team => (
                                        <option key={team.id} value={team.id}>{team.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Ekip Lideri <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={teamLeader}
                                    onChange={(e) => setTeamLeader(e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    required
                                    disabled={!selectedTeamId}
                                >
                                    <option value="">Lider seçin</option>
                                    {availableMembers.map(member => (
                                        <option key={member} value={member}>{member}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {selectedTeamId && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Ekip Üyeleri
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {availableMembers.filter(m => m !== teamLeader).map(member => (
                                        <button
                                            key={member}
                                            type="button"
                                            onClick={() => toggleMember(member)}
                                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${selectedMembers.includes(member)
                                                    ? 'bg-blue-100 text-blue-700 border-blue-300'
                                                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                                                }`}
                                        >
                                            {selectedMembers.includes(member) && (
                                                <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                            {member}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Schedule */}
                    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Takvim ve Kaynak Planlaması</h2>

                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Planlanan Başlangıç <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={plannedStartDate}
                                    onChange={(e) => setPlannedStartDate(e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Planlanan Bitiş <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={plannedEndDate}
                                    onChange={(e) => setPlannedEndDate(e.target.value)}
                                    min={plannedStartDate}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Planlanan Adam-Gün
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={plannedManDays}
                                        onChange={(e) => setPlannedManDays(e.target.value)}
                                        placeholder={calculateManDays() > 0 ? `Tahmini: ${calculateManDays()}` : 'Gün sayısı'}
                                        min="1"
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">gün</span>
                                </div>
                            </div>
                        </div>

                        {calculateManDays() > 0 && !plannedManDays && (
                            <p className="text-sm text-gray-500 mt-2">
                                💡 Seçilen tarih aralığına göre tahmini iş günü: <strong>{calculateManDays()} gün</strong>
                            </p>
                        )}
                    </div>

                    {/* Scope and Objectives */}
                    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Kapsam ve Hedefler</h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Denetim Hedefleri
                                </label>
                                <textarea
                                    value={objectives}
                                    onChange={(e) => setObjectives(e.target.value)}
                                    placeholder="Denetimin başlıca hedeflerini ve beklenen sonuçları açıklayın..."
                                    rows={3}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Denetim Kapsamı
                                </label>
                                <textarea
                                    value={scope}
                                    onChange={(e) => setScope(e.target.value)}
                                    placeholder="Denetim kapsamına dahil olan süreçler, sistemler ve alanları belirtin..."
                                    rows={3}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Summary Preview */}
                    {auditName && auditedUnit && selectedTeamId && plannedStartDate && plannedEndDate && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                            <h3 className="text-sm font-semibold text-blue-800 mb-2">Plan Özeti</h3>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                                <p><span className="text-blue-600">Denetim:</span> {auditName}</p>
                                <p><span className="text-blue-600">Birim:</span> {auditedUnit}</p>
                                <p><span className="text-blue-600">Ekip:</span> {selectedTeam?.name}</p>
                                <p><span className="text-blue-600">Lider:</span> {teamLeader || '—'}</p>
                                <p><span className="text-blue-600">Tarih:</span> {plannedStartDate} → {plannedEndDate}</p>
                                <p><span className="text-blue-600">Adam-Gün:</span> {plannedManDays || calculateManDays() || '—'}</p>
                            </div>
                        </div>
                    )}

                    {submitError && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
                            {submitError}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                        <Link
                            href="/audits/plans"
                            className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900"
                        >
                            İptal
                        </Link>
                        <div className="flex items-center gap-3">
                            <button
                                type="submit"
                                disabled={submitting}
                                className="px-5 py-2.5 text-sm font-medium text-white bg-[#1e3a5f] rounded-lg hover:bg-[#152a45] disabled:opacity-50"
                            >
                                {submitting ? 'Kaydediliyor...' : 'Denetim Planını Oluştur'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
