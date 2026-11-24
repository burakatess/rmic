import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AnnualPlanStepper, PlanDecisionDialog, PlanDecisionHistory, stepIndexOf } from '@/components/controls/AnnualPlanLifecycle';
import api from '@/lib/api';

jest.mock('@/lib/api', () => ({
    __esModule: true,
    ApiError: class ApiError extends Error { },
    default: { getAnnualPlanHistory: jest.fn() },
}));

describe('Yıllık plan yaşam döngüsü bileşenleri', () => {
    it('adım göstergesi: durum doğru adıma eşlenir; "Değişiklik İstendi" taslak adımına döner ve ayrıca işaretlenir', () => {
        expect(stepIndexOf('OPEN')).toBe(0);
        expect(stepIndexOf('CHANGES_REQUESTED')).toBe(0);
        expect(stepIndexOf('PENDING_APPROVAL')).toBe(1);
        expect(stepIndexOf('APPROVED')).toBe(2);
        expect(stepIndexOf('APPLIED')).toBe(3);
        const { rerender } = render(<AnnualPlanStepper status="PENDING_APPROVAL" />);
        expect(screen.getByText('Onay Bekliyor').closest('li')).toHaveAttribute('aria-current', 'step');
        rerender(<AnnualPlanStepper status="CHANGES_REQUESTED" />);
        expect(screen.getByText(/Değişiklik istendi/)).toBeInTheDocument();
        expect(screen.getByText('Taslak').closest('li')).toHaveAttribute('aria-current', 'step');
    });

    it('değişiklik iste: gerekçe boşken Gönder kapalı; yazılınca kırpılmış not iletilir (window.prompt yok)', () => {
        const prompt = jest.spyOn(window, 'prompt').mockImplementation(() => null);
        const onSubmit = jest.fn();
        render(<PlanDecisionDialog mode="request-changes" busy={false} onCancel={() => { }} onSubmit={onSubmit} />);
        const send = screen.getByRole('button', { name: 'Gönder' });
        expect(send).toBeDisabled();
        fireEvent.change(screen.getByLabelText(/Karar notu/), { target: { value: '   ' } });
        expect(send).toBeDisabled();
        fireEvent.change(screen.getByLabelText(/Karar notu/), { target: { value: '  Takvim eksik  ' } });
        fireEvent.click(send);
        expect(onSubmit).toHaveBeenCalledWith('Takvim eksik');
        expect(prompt).not.toHaveBeenCalled();
    });

    it('onay: not isteğe bağlıdır — boş notla da onaylanabilir', () => {
        const onSubmit = jest.fn();
        render(<PlanDecisionDialog mode="approve" busy={false} onCancel={() => { }} onSubmit={onSubmit} />);
        fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));
        expect(onSubmit).toHaveBeenCalledWith('');
    });

    it('karar geçmişi: olaylar, kişi ve notlarıyla listelenir; olay yoksa hiçbir şey çizilmez', async () => {
        (api.getAnnualPlanHistory as jest.Mock).mockResolvedValueOnce([
            { id: '2', action: 'ANNUAL_PLAN_REQUEST_CHANGES', at: '2026-11-22T10:00:00Z', revision: 4, note: 'Takvim eksik', by: { id: 'u2', name: 'Ayşe Yönetici' } },
            { id: '1', action: 'ANNUAL_PLAN_SUBMIT', at: '2026-11-21T10:00:00Z', revision: 4, note: null, by: { id: 'u1', name: 'Kemal Planlayıcı' } },
        ]);
        render(<PlanDecisionHistory year={2026} refreshKey="a" />);
        fireEvent.click(await screen.findByRole('button', { name: /Karar geçmişi \(2\)/ }));
        expect(screen.getByText('Değişiklik istendi')).toBeInTheDocument();
        expect(screen.getByText('Takvim eksik')).toBeInTheDocument();
        expect(screen.getByText(/Ayşe Yönetici/)).toBeInTheDocument();
        expect(screen.getByText('Onaya gönderildi')).toBeInTheDocument();
    });

    it('karar geçmişi boşsa render edilmez', async () => {
        (api.getAnnualPlanHistory as jest.Mock).mockResolvedValueOnce([]);
        const { container } = render(<PlanDecisionHistory year={2027} refreshKey="b" />);
        await waitFor(() => expect(api.getAnnualPlanHistory).toHaveBeenCalledWith(2027));
        expect(container).toBeEmptyDOMElement();
    });
});
