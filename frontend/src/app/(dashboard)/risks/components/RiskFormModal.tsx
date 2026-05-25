'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Input, Select, Button, Textarea } from '@/components/ui';

interface RiskFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  initialData?: any;
}

const CATEGORIES = [
  { value: 'BT Riski', label: 'BT Riski' },
  { value: 'Uyum Riski', label: 'Uyum Riski' },
  { value: 'Operasyonel Risk', label: 'Operasyonel Risk' },
  { value: 'Stratejik Risk', label: 'Stratejik Risk' },
  { value: 'Finansal Risk', label: 'Finansal Risk' },
];

export function RiskFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
}: RiskFormModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: 'BT Riski',
    description: '',
    ownerName: '',
    ownerDept: '',
    inherentProbability: 3,
    inherentImpact: 4,
  });

  useEffect(() => {
    if (initialData && isOpen) {
      setFormData({
        name: initialData.name || '',
        category: initialData.category || 'BT Riski',
        description: initialData.description || '',
        ownerName: initialData.owner?.name || '',
        ownerDept: initialData.owner?.department || '',
        inherentProbability: Math.ceil((initialData.inherentScore || 12) / 5),
        inherentImpact: 5,
      });
    } else if (isOpen) {
      setFormData({
        name: '',
        category: 'BT Riski',
        description: '',
        ownerName: '',
        ownerDept: '',
        inherentProbability: 3,
        inherentImpact: 4,
      });
    }
  }, [initialData, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(formData);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={initialData ? "Riski Düzenle" : "Yeni Risk Ekle"}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Input
          label="Risk Adı"
          value={formData.name}
          onChange={e => setFormData({ ...formData, name: e.target.value })}
          required
          placeholder="Riskin başlığını giriniz"
        />

        <Textarea
          label="Risk Açıklaması"
          value={formData.description}
          onChange={e => setFormData({ ...formData, description: e.target.value })}
          placeholder="Riskin detaylı açıklamasını giriniz"
          rows={3}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Kategori"
            value={formData.category}
            onChange={e => setFormData({ ...formData, category: e.target.value })}
            options={CATEGORIES}
            required
            hint="Risk ID kategorisine göre otomatik oluşturulacaktır."
          />
          
          <div className="space-y-4">
            <Input
              label="Risk Sahibi Adı"
              value={formData.ownerName}
              onChange={e => setFormData({ ...formData, ownerName: e.target.value })}
              placeholder="Örn: Ahmet Yılmaz"
            />
            <Input
              label="Risk Sahibi Departmanı"
              value={formData.ownerDept}
              onChange={e => setFormData({ ...formData, ownerDept: e.target.value })}
              placeholder="Örn: Bilgi Teknolojileri"
            />
          </div>
        </div>

        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
          <h4 className="text-sm font-medium text-slate-900 mb-4">Doğal Risk Değerlendirmesi</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Olasılık (1-5)"
              value={String(formData.inherentProbability)}
              onChange={e => setFormData({ ...formData, inherentProbability: Number(e.target.value) })}
              options={[
                { value: '1', label: '1 - Çok Düşük' },
                { value: '2', label: '2 - Düşük' },
                { value: '3', label: '3 - Orta' },
                { value: '4', label: '4 - Yüksek' },
                { value: '5', label: '5 - Çok Yüksek' },
              ]}
              required
            />
            <Select
              label="Etki (1-5)"
              value={String(formData.inherentImpact)}
              onChange={e => setFormData({ ...formData, inherentImpact: Number(e.target.value) })}
              options={[
                { value: '1', label: '1 - Çok Düşük' },
                { value: '2', label: '2 - Düşük' },
                { value: '3', label: '3 - Orta' },
                { value: '4', label: '4 - Yüksek' },
                { value: '5', label: '5 - Çok Yüksek' },
              ]}
              required
            />
          </div>
          <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between">
            <span className="text-sm text-slate-600">Hesaplanan Doğal Skor:</span>
            <span className="text-lg font-bold text-slate-900">
              {formData.inherentProbability * formData.inherentImpact}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            İptal
          </Button>
          <Button type="submit" variant="primary" loading={loading} disabled={!formData.name}>
            {initialData ? "Kaydet" : "Risk Oluştur"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
