import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FindingFollowUpModal } from '@/components/modals/FindingFollowUpModal';
import api from '@/lib/api';

jest.mock('@/lib/api', () => ({
    __esModule: true,
    default: {
        getUsers: jest.fn().mockResolvedValue([]),
        updateFollowUp: jest.fn().mockResolvedValue({}),
        assignSecondController: jest.fn(),
    },
}));

jest.mock('@/components/ui/Toast', () => ({
    useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

describe('Bulgu takip değerlendirme formu', () => {
    const followUp = {
        id: 'fu-1', followUpId: 'T-2026-0001', status: 'DEVAM_EDIYOR',
        currentStatusDetail: 'Mevcut durum',
    };

    beforeEach(() => jest.clearAllMocks());

    it('YETERLI sonucunu açıkça kaydeder ve kullanıcıdan kapanış kararı istemez', async () => {
        render(
            <FindingFollowUpModal
                isOpen findingId="f-1" followUp={followUp}
                actions={[]} onClose={jest.fn()} onSuccess={jest.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /^Yeterli/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Güncelle' }));

        await waitFor(() => expect(api.updateFollowUp).toHaveBeenCalledWith(
            'f-1', 'fu-1', expect.objectContaining({ result: 'YETERLI', resolutionOutcome: null }),
        ));
        expect(screen.getByText(/Kapanış kararı elle seçilmez/)).toBeInTheDocument();
    });

    it('YETERSIZ sonucunda erteleme seçilince yeni takip tarihini gösterir', async () => {
        render(
            <FindingFollowUpModal
                isOpen findingId="f-1" followUp={followUp}
                actions={[]} onClose={jest.fn()} onSuccess={jest.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /^Yetersiz/ }));
        fireEvent.click(screen.getByRole('button', { name: /^Ertelendi/ }));

        expect(screen.getByLabelText('Yeni Takip Tarihi *')).toBeInTheDocument();
    });
});
