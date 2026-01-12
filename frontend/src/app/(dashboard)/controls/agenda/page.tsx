'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

interface Control {
    id: string;
    controlId: string;
    name: string;
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'AD_HOC';
    controlDate?: string;
    owner?: {
        id: string;
        firstName: string;
        lastName: string;
    };
    effectivenessStatus?: string;
    lastTestDate?: string;
    nextTestDate?: string;
}

interface ScheduledControl {
    control: Control;
    date: Date;
    status: 'completed' | 'due' | 'overdue' | 'upcoming';
}

const frequencyLabels: Record<string, string> = {
    DAILY: 'Günlük',
    WEEKLY: 'Haftalık',
    MONTHLY: 'Aylık',
    QUARTERLY: '3 Aylık',
    ANNUAL: 'Yıllık',
    AD_HOC: 'Arızi',
};

const frequencyColors: Record<string, { bg: string; text: string; badge: string }> = {
    DAILY: { bg: 'bg-blue-50', text: 'text-blue-700', badge: 'bg-blue-500' },
    WEEKLY: { bg: 'bg-orange-50', text: 'text-orange-700', badge: 'bg-orange-500' },
    MONTHLY: { bg: 'bg-purple-50', text: 'text-purple-700', badge: 'bg-purple-500' },
    QUARTERLY: { bg: 'bg-indigo-50', text: 'text-indigo-700', badge: 'bg-indigo-600' },
    ANNUAL: { bg: 'bg-gray-100', text: 'text-gray-700', badge: 'bg-gray-600' },
    AD_HOC: { bg: 'bg-rose-50', text: 'text-rose-700', badge: 'bg-rose-500' },
};

const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
    completed: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
    due: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
    overdue: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
    upcoming: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
};

const statusLabels: Record<string, string> = {
    completed: 'Tamamlandı',
    due: 'Bugün',
    overdue: 'Gecikmiş',
    upcoming: 'Yaklaşan',
};

const turkishMonths = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

const turkishDays = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];

// Get Monday of the week for a given date
function getMonday(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

// Get week number
function getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

// Check if date is a business day (Mon-Fri)
function isBusinessDay(date: Date): boolean {
    const day = date.getDay();
    return day >= 1 && day <= 5;
}

// Get last business day of month
function getLastBusinessDayOfMonth(year: number, month: number): Date {
    let date = new Date(year, month + 1, 0);
    while (!isBusinessDay(date)) {
        date.setDate(date.getDate() - 1);
    }
    return date;
}

// Check if two dates are the same day
function isSameDay(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate();
}

export default function ControlAgendaPage() {
    const router = useRouter();
    const [controls, setControls] = useState<Control[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());

    // Filters
    const [ownerFilter, setOwnerFilter] = useState<string>('all');
    const [frequencyFilter, setFrequencyFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [onlyMine, setOnlyMine] = useState(false);

    useEffect(() => {
        loadControls();
    }, []);

    const loadControls = async () => {
        try {
            const res = await api.getControls() as any;
            const controlList = Array.isArray(res) ? res : (res?.data || []);
            // Transform to expected format
            const transformedControls: Control[] = controlList.map((c: any) => ({
                id: String(c.id),
                controlId: String(c.controlId || ''),
                name: String(c.name || ''),
                frequency: c.frequency || 'MONTHLY',
                owner: c.owner ? {
                    id: String(c.owner.id || c.ownerId || ''),
                    firstName: String(c.owner.firstName || 'Unknown'),
                    lastName: String(c.owner.lastName || ''),
                } : undefined,
                effectivenessStatus: c.effectivenessStatus,
                lastTestDate: c.lastTestDate,
                nextTestDate: c.nextTestDate,
                controlDate: c.controlDate,
            }));
            setControls(transformedControls);
        } catch (error) {
            console.error('Failed to load controls:', error);
        } finally {
            setLoading(false);
        }
    };

    // Get start of week (Monday)
    const weekStart = useMemo(() => getMonday(currentDate), [currentDate]);

    // Generate weekdays (Mon-Fri)
    const weekDays = useMemo(() => {
        const days: Date[] = [];
        for (let i = 0; i < 5; i++) {
            const day = new Date(weekStart);
            day.setDate(weekStart.getDate() + i);
            days.push(day);
        }
        return days;
    }, [weekStart]);

    // Generate scheduled controls for the week
    const scheduledControls = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const scheduled: ScheduledControl[] = [];

        controls.forEach(control => {
            weekDays.forEach(day => {
                let shouldShow = false;

                switch (control.frequency) {
                    case 'DAILY':
                        shouldShow = true;
                        break;
                    case 'WEEKLY':
                        // Show on Fridays
                        shouldShow = day.getDay() === 5;
                        break;
                    case 'MONTHLY':
                        // Show on last business day of month
                        const lastBizDay = getLastBusinessDayOfMonth(day.getFullYear(), day.getMonth());
                        shouldShow = isSameDay(day, lastBizDay);
                        break;
                    case 'QUARTERLY':
                        // Show on last business day of quarter months (Jan, Apr, Jul, Oct)
                        const quarterMonths = [0, 3, 6, 9];
                        if (quarterMonths.includes(day.getMonth())) {
                            const lastBizDayQ = getLastBusinessDayOfMonth(day.getFullYear(), day.getMonth());
                            shouldShow = isSameDay(day, lastBizDayQ);
                        }
                        break;
                    case 'ANNUAL':
                        // Show on last business day of December
                        if (day.getMonth() === 11) {
                            const lastBizDayY = getLastBusinessDayOfMonth(day.getFullYear(), 11);
                            shouldShow = isSameDay(day, lastBizDayY);
                        }
                        break;
                    case 'AD_HOC':
                        // Show on specific control date
                        if (control.controlDate) {
                            const controlDateObj = new Date(control.controlDate);
                            shouldShow = isSameDay(day, controlDateObj);
                        }
                        break;
                }

                if (shouldShow) {
                    let status: 'completed' | 'due' | 'overdue' | 'upcoming' = 'upcoming';
                    const dayTime = new Date(day);
                    dayTime.setHours(0, 0, 0, 0);

                    if (control.lastTestDate) {
                        const lastTest = new Date(control.lastTestDate);
                        lastTest.setHours(0, 0, 0, 0);
                        if (lastTest >= dayTime) {
                            status = 'completed';
                        }
                    }

                    if (status !== 'completed') {
                        if (isSameDay(dayTime, today)) {
                            status = 'due';
                        } else if (dayTime < today) {
                            status = 'overdue';
                        }
                    }

                    scheduled.push({ control, date: day, status });
                }
            });
        });

        return scheduled;
    }, [controls, weekDays]);

    // Apply filters
    const filteredSchedule = useMemo(() => {
        return scheduledControls.filter(item => {
            if (ownerFilter !== 'all' && item.control.owner?.id !== ownerFilter) return false;
            if (frequencyFilter !== 'all' && item.control.frequency !== frequencyFilter) return false;
            if (statusFilter !== 'all' && item.status !== statusFilter) return false;
            return true;
        });
    }, [scheduledControls, ownerFilter, frequencyFilter, statusFilter]);

    // Get unique owners for filter
    const owners = useMemo(() => {
        const ownerMap = new Map<string, { id: string; name: string }>();
        controls.forEach(c => {
            if (c.owner) {
                ownerMap.set(c.owner.id, {
                    id: c.owner.id,
                    name: `${c.owner.firstName} ${c.owner.lastName}`
                });
            }
        });
        return Array.from(ownerMap.values());
    }, [controls]);

    // Navigation
    const goToPreviousWeek = () => {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() - 7);
        setCurrentDate(newDate);
    };

    const goToNextWeek = () => {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + 7);
        setCurrentDate(newDate);
    };

    const goToToday = () => {
        setCurrentDate(new Date());
    };

    // Get controls for a specific day
    const getControlsForDay = (day: Date) => {
        return filteredSchedule.filter(item => isSameDay(item.date, day));
    };

    const weekNumber = getWeekNumber(weekStart);
    const monthName = turkishMonths[weekStart.getMonth()];
    const year = weekStart.getFullYear();

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Kontrol Takip Ajandası</h1>
                    <p className="text-gray-500 mt-1">Kontrollerinizi takvim üzerinden takip edin</p>
                </div>

                {/* Week Navigation */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={goToToday}
                        className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        Bugün
                    </button>
                    <div className="flex items-center bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <button
                            onClick={goToPreviousWeek}
                            className="p-2.5 hover:bg-gray-50 transition-colors border-r border-gray-200"
                        >
                            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <div className="px-4 py-2 min-w-[200px] text-center">
                            <span className="font-semibold text-gray-900">{monthName} {year}</span>
                            <span className="text-gray-500 ml-2">– Hafta {weekNumber}</span>
                        </div>
                        <button
                            onClick={goToNextWeek}
                            className="p-2.5 hover:bg-gray-50 transition-colors border-l border-gray-200"
                        >
                            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex flex-wrap items-center gap-4">
                    {/* Owner Filter */}
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-600">Sahip:</label>
                        <select
                            value={ownerFilter}
                            onChange={(e) => setOwnerFilter(e.target.value)}
                            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white"
                        >
                            <option value="all">Tümü</option>
                            {owners.map(owner => (
                                <option key={owner.id} value={owner.id}>{owner.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Frequency Filter */}
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-600">Sıklık:</label>
                        <select
                            value={frequencyFilter}
                            onChange={(e) => setFrequencyFilter(e.target.value)}
                            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white"
                        >
                            <option value="all">Tümü</option>
                            <option value="DAILY">Günlük</option>
                            <option value="WEEKLY">Haftalık</option>
                            <option value="MONTHLY">Aylık</option>
                            <option value="QUARTERLY">3 Aylık</option>
                            <option value="YEARLY">Yıllık</option>
                        </select>
                    </div>

                    {/* Status Filter */}
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-600">Durum:</label>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white"
                        >
                            <option value="all">Tümü</option>
                            <option value="completed">Tamamlandı</option>
                            <option value="due">Bugün</option>
                            <option value="overdue">Gecikmiş</option>
                            <option value="upcoming">Yaklaşan</option>
                        </select>
                    </div>

                    {/* Only Mine Toggle */}
                    <label className="flex items-center gap-2 cursor-pointer ml-auto">
                        <input
                            type="checkbox"
                            checked={onlyMine}
                            onChange={(e) => setOnlyMine(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-sm font-medium text-gray-600">Sadece Benim Kontrollerim</span>
                    </label>
                </div>
            </div>

            {/* Weekly Agenda */}
            <div className="grid grid-cols-5 gap-4">
                {weekDays.map((day, idx) => {
                    const dayControls = getControlsForDay(day);
                    const today = new Date();
                    const isToday = isSameDay(day, today);

                    return (
                        <div
                            key={idx}
                            className={`bg-white rounded-2xl shadow-sm border overflow-hidden min-h-[500px] flex flex-col ${isToday ? 'border-amber-400 ring-2 ring-amber-100' : 'border-gray-100'
                                }`}
                        >
                            {/* Day Header */}
                            <div className={`px-4 py-3 border-b ${isToday ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'
                                }`}>
                                <p className={`text-xs font-medium uppercase ${isToday ? 'text-amber-600' : 'text-gray-500'
                                    }`}>
                                    {turkishDays[idx]}
                                </p>
                                <p className={`text-xl font-bold ${isToday ? 'text-amber-700' : 'text-gray-900'
                                    }`}>
                                    {day.getDate()}
                                </p>
                            </div>

                            {/* Controls List */}
                            <div className="flex-1 p-3 space-y-2 overflow-y-auto">
                                {dayControls.length === 0 ? (
                                    <p className="text-sm text-gray-400 text-center py-8">
                                        Kontrol yok
                                    </p>
                                ) : (
                                    dayControls.map((item, controlIdx) => {
                                        const colors = frequencyColors[item.control.frequency] || frequencyColors.DAILY;
                                        const statusColor = statusColors[item.status];

                                        return (
                                            <button
                                                key={`${item.control.id}-${controlIdx}`}
                                                onClick={() => router.push(`/controls/${item.control.id}`)}
                                                className={`w-full p-3 rounded-xl border-l-4 text-left transition-all hover:shadow-md ${colors.bg} ${item.status === 'overdue' ? 'border-l-red-500' :
                                                    item.status === 'due' ? 'border-l-amber-500' :
                                                        item.status === 'completed' ? 'border-l-green-500' :
                                                            'border-l-gray-300'
                                                    }`}
                                            >
                                                {/* Control Name */}
                                                <p className="font-medium text-gray-900 text-sm line-clamp-2">
                                                    {item.control.name}
                                                </p>

                                                {/* Badges Row */}
                                                <div className="flex items-center gap-2 mt-2">
                                                    {/* Frequency Badge */}
                                                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium text-white ${colors.badge}`}>
                                                        {frequencyLabels[item.control.frequency]}
                                                    </span>

                                                    {/* Status Indicator */}
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${statusColor.bg} ${statusColor.text}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${statusColor.dot}`}></span>
                                                        {statusLabels[item.status]}
                                                    </span>
                                                </div>

                                                {/* Owner */}
                                                {item.control.owner && (
                                                    <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                        </svg>
                                                        {item.control.owner.firstName} {item.control.owner.lastName}
                                                    </p>
                                                )}

                                                {/* Arrow Icon */}
                                                <div className="flex justify-end mt-2">
                                                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex flex-wrap items-center gap-6">
                    <span className="text-sm font-medium text-gray-600">Sıklık:</span>
                    {Object.entries(frequencyLabels).filter(([k]) => k !== 'CONTINUOUS').map(([key, label]) => (
                        <div key={key} className="flex items-center gap-2">
                            <span className={`w-3 h-3 rounded ${frequencyColors[key]?.badge || 'bg-gray-400'}`}></span>
                            <span className="text-sm text-gray-600">{label}</span>
                        </div>
                    ))}

                    <span className="text-gray-300">|</span>

                    <span className="text-sm font-medium text-gray-600">Durum:</span>
                    {Object.entries(statusLabels).map(([key, label]) => (
                        <div key={key} className="flex items-center gap-2">
                            <span className={`w-3 h-3 rounded-full ${statusColors[key]?.dot || 'bg-gray-400'}`}></span>
                            <span className="text-sm text-gray-600">{label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
