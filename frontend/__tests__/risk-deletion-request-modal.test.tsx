import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RiskDeletionRequestModal } from '@/components/risks/RiskDeletionRequestModal';
import api, { ApiError } from '@/lib/api';

jest.mock('@/lib/api', () => {
    class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
    return {
        __esModule: true,
        ApiError,
        default: {
            requestDeletion: jest.fn(),
            getDeletionApprovers: jest.fn().mockResolvedValue([{ id: 'u2', name: 'Fatma Kaya', role: 'RISK_CONTROL_MANAGER' }]),
        },
    };
});
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));

describe('Risk silme talebi penceresi', () => {
    beforeEach(() => jest.clearAllMocks());

    it('kimin onayına gideceğini gösterir; engellenen talebin nedeni pencerede kalır, gönderilen kapanır', async () => {
        (api.requestDeletion as jest.Mock)
            .mockRejectedValueOnce(new (ApiError as any)(409, 'Risk silinemez: 2 bağlı bulgu var. Önce bağlantıları kaldırın.'))
            .mockResolvedValueOnce({ requested: true });
        const onClose = jest.fn(); const onDone = jest.fn();
        render(<RiskDeletionRequestModal type="RISK" targets={[{ id: 'r1', code: 'R-2026-0001', title: 'Veri sızıntısı' }]} onClose={onClose} onDone={onDone} />);
        expect(await screen.findByText(/Fatma Kaya/)).toBeInTheDocument();

        const send = screen.getByRole('button', { name: 'Silme Talebi Gönder' });
        expect(send).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Silme Gerekçesi *'), { target: { value: 'Mükerrer' } });
        fireEvent.click(send);
        expect(await screen.findByRole('alert')).toHaveTextContent('2 bağlı bulgu');
        expect(onClose).not.toHaveBeenCalled();
        expect(api.requestDeletion).toHaveBeenCalledWith('RISK', 'r1', 'Mükerrer');

        fireEvent.click(screen.getByRole('button', { name: 'Silme Talebi Gönder' }));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(onDone).toHaveBeenCalledTimes(1);
    });
});
