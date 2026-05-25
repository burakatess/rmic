'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { DetailDrawer, StatusBadge, getStatusVariant, Button, Tabs, EmptyState } from '@/components/ui';

// Tip tanımlamaları (page.tsx'teki yapı ile uyumlu)
interface Risk {
  id: string;
  riskId: string;
  name: string;
  description: string;
  category: string;
  owner: { name: string; department: string };
  inherentScore: number;
  residualScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  appetiteStatus: 'WITHIN' | 'EXCEEDED';
  status: 'IDENTIFIED' | 'ASSESSED' | 'TREATED' | 'MONITORED' | 'CLOSED';
  linkedControls: { id: string; name: string }[];
  linkedFindings: { id: string; title: string }[];
  lastReviewDate: string;
}

interface RiskDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  risk: Risk | null;
  onEdit?: (risk: Risk) => void;
  onDelete?: (risk: Risk) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function RiskDetailDrawer({
  isOpen,
  onClose,
  risk,
  onEdit,
  onDelete,
  canEdit = false,
  canDelete = false,
}: RiskDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState('controls');

  if (!risk) return null;

  const handleEdit = () => {
    onClose();
    if (onEdit) onEdit(risk);
  };

  const handleDelete = () => {
    if (onDelete && confirm(`${risk.riskId} ID'li riski silmek istediğinize emin misiniz?`)) {
      onClose();
      onDelete(risk);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 20) return 'text-red-600';
    if (score >= 15) return 'text-orange-600';
    if (score >= 10) return 'text-amber-600';
    if (score >= 5) return 'text-emerald-600';
    return 'text-slate-600';
  };

  return (
    <DetailDrawer
      open={isOpen}
      onClose={onClose}
      title={`${risk.riskId} - ${risk.name}`}
      subtitle={`Kategori: ${risk.category}`}
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div>
            {canDelete && (
              <Button variant="danger" onClick={handleDelete}>
                Sil
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onClose}>Kapat</Button>
            {canEdit && (
              <Button variant="primary" onClick={handleEdit}>
                Düzenle
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {/* Basic Info */}
        <div className="bg-slate-50 p-5 rounded-xl border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-900">{risk.name}</h2>
            <StatusBadge variant={getStatusVariant(risk.status)} size="md">{risk.status}</StatusBadge>
          </div>
          <p className="text-sm text-slate-600 mb-6">{risk.description || 'Açıklama bulunmuyor.'}</p>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Kategori</p>
              <p className="text-sm font-medium text-slate-900">{risk.category}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Risk Sahibi</p>
              <p className="text-sm font-medium text-slate-900">{risk.owner.name}</p>
              <p className="text-xs text-slate-500">{risk.owner.department}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Risk İştahı</p>
              {risk.appetiteStatus === 'WITHIN' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  İştah Dahilinde
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-50 text-red-700 text-xs font-medium border border-red-200">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                  İştah Aşımı
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Son İnceleme</p>
              <p className="text-sm font-medium text-slate-900">{risk.lastReviewDate}</p>
            </div>
          </div>
        </div>

        {/* Scores */}
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-4 px-1">Skorlama</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Doğal Risk</p>
                <p className="text-xs text-slate-400">Kontroller dikkate alınmadan</p>
              </div>
              <div className={`text-3xl font-bold ${getScoreColor(risk.inherentScore)}`}>
                {risk.inherentScore}
              </div>
            </div>
            <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Rezidüel Risk</p>
                <p className="text-xs text-slate-400">Kontroller uygulandıktan sonra</p>
              </div>
              <div className={`text-3xl font-bold ${getScoreColor(risk.residualScore)}`}>
                {risk.residualScore}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs for Relations */}
        <div className="mt-2">
          <Tabs
            tabs={[
              { key: 'controls', label: 'İlişkili Kontroller', count: risk.linkedControls.length },
              { key: 'findings', label: 'İlişkili Bulgular', count: risk.linkedFindings.length }
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
          <div className="mt-4">
            {activeTab === 'controls' && (
              risk.linkedControls.length > 0 ? (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden mt-4">
                  {risk.linkedControls.map(ctrl => (
                    <div key={ctrl.id} className="p-4 bg-white hover:bg-slate-50 transition-colors flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{ctrl.id}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{ctrl.name}</p>
                      </div>
                      <Link href={`/controls/${ctrl.id}`}>
                        <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700">
                          Detay
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
                  <EmptyState 
                    title="İlişkili Kontrol Yok" 
                    description="Bu riske bağlı herhangi bir kontrol bulunmuyor." 
                    icon={<svg className="w-12 h-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                  />
                </div>
              )
            )}
            
            {activeTab === 'findings' && (
              risk.linkedFindings.length > 0 ? (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden mt-4">
                  {risk.linkedFindings.map(finding => (
                    <div key={finding.id} className="p-4 bg-white hover:bg-slate-50 transition-colors flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{finding.id}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{finding.title}</p>
                      </div>
                      <Link href={`/findings/${finding.id}`}>
                        <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700">
                          Detay
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
                  <EmptyState 
                    title="İlişkili Bulgu Yok" 
                    description="Bu riske bağlı herhangi bir bulgu bulunmuyor." 
                    icon={<svg className="w-12 h-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
                  />
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </DetailDrawer>
  );
}
