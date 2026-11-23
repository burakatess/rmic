import { render, screen } from '@testing-library/react';
import ControlHistoryPanel from '@/components/controls/ControlHistoryPanel';
import api from '@/lib/api';

jest.mock('@/lib/api', () => ({ __esModule: true, default: { getControlHistory: jest.fn() } }));

describe('ControlHistoryPanel', () => {
    it('olayları Türkçe adlarla, alan farkını eski → yeni olarak, kapsam yılı ve kişiyle gösterir', async () => {
        (api.getControlHistory as jest.Mock).mockResolvedValue([
            { id: 'h3', action: 'SCOPE_ASSIGNMENT_CHANGE', entityType: 'ControlYearScope', year: 2026, at: '2026-11-20T10:00:00Z', by: 'Ayşe Yönetici', changes: [], detail: 'Ekip değişikliği' },
            { id: 'h2', action: 'MAP_RISK', entityType: 'ControlRiskMapping', year: null, at: '2026-11-19T10:00:00Z', by: 'Ayşe Yönetici', changes: [], detail: 'R-1 · Erişim riski' },
            { id: 'h1', action: 'UPDATE', entityType: 'Control', year: null, at: '2026-11-18T10:00:00Z', by: null,
                changes: [{ field: 'frequency', label: 'Sıklık', from: 'MONTHLY', to: 'QUARTERLY' }], detail: null },
        ]);
        render(<ControlHistoryPanel controlId="c1" />);
        const list = await screen.findByTestId('control-history');
        expect(list).toHaveTextContent('Kontrolcü ataması değişti');
        expect(list).toHaveTextContent('2026 kapsamı');
        expect(list).toHaveTextContent('Risk eşleştirildi');
        expect(list).toHaveTextContent('R-1 · Erişim riski');
        expect(list).toHaveTextContent('Kontrol güncellendi');
        expect(screen.getByText('Sıklık')).toBeInTheDocument();
        expect(screen.getByText('Aylık')).toHaveClass('line-through'); // ham enum değil, etiket
        expect(screen.getByText('3 Aylık')).toBeInTheDocument();
        expect(list).toHaveTextContent('Sistem'); // kişi yoksa
    });

    it('kayıt yoksa boş durum metni gösterir', async () => {
        (api.getControlHistory as jest.Mock).mockResolvedValue([]);
        render(<ControlHistoryPanel controlId="c1" />);
        expect(await screen.findByText('Bu kontrol için kayıtlı değişiklik yok.')).toBeInTheDocument();
    });
});
