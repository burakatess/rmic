import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeletionRequestsPanel } from '@/components/approvals/DeletionRequestsPanel';
import api from '@/lib/api';

jest.mock('@/lib/api', () => ({
    __esModule: true,
    default: {
        getDeletionRequests: jest.fn(),
        decideDeletion: jest.fn().mockResolvedValue({}),
    },
}));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));

const row = {
    type: 'FINDING', id: 'f1', code: 'B-2027-0001', title: 'Bulgu', reason: 'Mükerrer bulgu', href: '/findings/f1',
    requestedBy: { id: 'u1', name: 'Mehmet Demir' }, requestedAt: new Date().toISOString(), canDecide: true,
};

describe('Silme talepleri paneli', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (api.getDeletionRequests as jest.Mock).mockResolvedValue([row]);
    });

    it('silme onayı tek tıkla uygulanmaz; sonucu anlatan teyit penceresinden sonra gider', async () => {
        render(<DeletionRequestsPanel />);
        fireEvent.click(await screen.findByRole('button', { name: 'Silmeyi onayla' }));
        expect(api.decideDeletion).not.toHaveBeenCalled();
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toHaveTextContent('bağlı açık aksiyon ve takip çalışmaları da iptal edilir');
        expect(dialog).toHaveTextContent('Mükerrer bulgu');
        const confirm = [...dialog.querySelectorAll('button')].find(b => b.textContent === 'Silmeyi onayla')!;
        fireEvent.click(confirm);
        await waitFor(() => expect(api.decideDeletion).toHaveBeenCalledWith('FINDING', 'f1', true, undefined));
    });
});
