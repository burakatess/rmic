import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RiskLinksPanel } from '@/components/risks/RiskLinksPanel';
import api from '@/lib/api';

jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));
jest.mock('@/lib/api', () => ({ __esModule: true, default: { getRisks: jest.fn() } }));

const linked = [{ id: 'r1', riskId: 'R-1', name: 'Yetkisiz erişim', description: 'Erişim hakları gözden geçirilmiyor', residualRiskScore: 12 }];

describe('RiskLinksPanel', () => {
    beforeEach(() => jest.clearAllMocks());

    it('kod/ad/tanım gösterir, kod risk detayına bağlanır; arama sonucunda eşleşmiş risk tekrar eklenemez', async () => {
        (api.getRisks as jest.Mock).mockResolvedValue({ data: [
            { id: 'r1', riskId: 'R-1', name: 'Yetkisiz erişim', description: 'x' },
            { id: 'r2', riskId: 'R-2', name: 'Veri kaybı', description: 'Yedek alınmıyor' },
        ] });
        const onLink = jest.fn().mockResolvedValue({});
        const onUnlink = jest.fn().mockResolvedValue({});
        render(<RiskLinksPanel risks={linked} editable onLink={onLink} onUnlink={onUnlink} />);

        const card = screen.getByTestId('risk-link-card');
        expect(card).toHaveTextContent('Yetkisiz erişim');
        expect(card).toHaveTextContent('Erişim hakları gözden geçirilmiyor');
        expect(screen.getByRole('link', { name: 'R-1' })).toHaveAttribute('href', '/risks/r1');

        fireEvent.click(screen.getByRole('button', { name: '+ Risk eşleştir' }));
        fireEvent.change(screen.getByLabelText('Risk ara'), { target: { value: 'veri' } });
        const list = await screen.findByTestId('risk-candidates');
        await waitFor(() => expect(list).toHaveTextContent('R-2'));
        expect(api.getRisks).toHaveBeenLastCalledWith({ search: 'veri', limit: 20 });
        expect(list).toHaveTextContent('Eşleştirildi'); // R-1 zaten bağlı → Ekle düğmesi yok
        fireEvent.click(screen.getByRole('button', { name: 'Ekle' }));
        await waitFor(() => expect(onLink).toHaveBeenCalledWith('r2'));

        fireEvent.click(screen.getByRole('button', { name: 'Kaldır' }));
        await waitFor(() => expect(onUnlink).toHaveBeenCalledWith('r1'));
    });

    it('düzenleme yetkisi yoksa ekle/kaldır görünmez', () => {
        render(<RiskLinksPanel risks={linked} editable={false} onLink={jest.fn()} onUnlink={jest.fn()} />);
        expect(screen.queryByRole('button', { name: '+ Risk eşleştir' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Kaldır' })).not.toBeInTheDocument();
    });
});
