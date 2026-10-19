import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FindingFollowUpModal } from '@/components/modals/FindingFollowUpModal';
import api from '@/lib/api';

jest.mock('@/lib/api', () => ({
    __esModule: true,
    default: {
        getUsers: jest.fn().mockResolvedValue([]),
        getDirectorates: jest.fn().mockResolvedValue([{ id: 'dir-1', name: 'Bilgi Teknolojileri' }]),
        updateFollowUp: jest.fn().mockResolvedValue({}),
        assignSecondController: jest.fn(),
    },
}));

jest.mock('@/components/ui/Toast', () => ({
    useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

describe('Bulgu takip değerlendirme formu', () => {
    const followUp = {
        id: 'fu-1', followUpId: 'T-2026-0001-01-01', status: 'DEVAM_EDIYOR',
        currentStatusDetail: 'Mevcut durum',
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (api.getUsers as jest.Mock).mockReturnValue(new Promise(() => undefined));
        (api.getDirectorates as jest.Mock).mockResolvedValue([{ id: 'dir-1', name: 'Bilgi Teknolojileri' }]);
    });

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

    it('Yeni Aksiyon Gerekli sonucunda aksiyon planı, sorumlu birim ve hedef tarih ister', async () => {
        render(
            <FindingFollowUpModal
                isOpen findingId="f-1" followUp={followUp}
                actions={[]} onClose={jest.fn()} onSuccess={jest.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /^Yeni Aksiyon Gerekli/ }));

        expect(screen.getByLabelText('Yeni Aksiyon Planı *')).toBeInTheDocument();
        expect(screen.getByLabelText('Sorumlu Birim *')).toBeInTheDocument();
        expect(screen.getByLabelText('Hedef Tarih *')).toBeInTheDocument();
        expect(screen.queryByLabelText('Yeni Takip Tarihi *')).not.toBeInTheDocument();
        expect(screen.getByText(/Yeni aksiyon oluşturulur/)).toBeInTheDocument();
    });

    it('Yeni Aksiyon Gerekli: plan veya birim eksikse kaydetmez', async () => {
        render(
            <FindingFollowUpModal
                isOpen findingId="f-1" followUp={followUp}
                actions={[]} onClose={jest.fn()} onSuccess={jest.fn()}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: /^Yeni Aksiyon Gerekli/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Güncelle' }));
        await new Promise(r => setTimeout(r, 0));
        expect(api.updateFollowUp).not.toHaveBeenCalled();
    });

    it('Yeni Aksiyon Gerekli: newAction yükü plan, birim ve hedef tarihle gönderilir', async () => {
        render(
            <FindingFollowUpModal
                isOpen findingId="f-1" followUp={followUp}
                actions={[]} onClose={jest.fn()} onSuccess={jest.fn()}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: /^Yeni Aksiyon Gerekli/ }));
        fireEvent.change(screen.getByLabelText('Yeni Aksiyon Planı *'), { target: { value: 'Kalıcı düzeltici aksiyon' } });
        await waitFor(() => expect(screen.getByRole('option', { name: 'Bilgi Teknolojileri' })).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Sorumlu Birim *'), { target: { value: 'dir-1' } });
        fireEvent.change(screen.getByLabelText('Hedef Tarih *'), { target: { value: '2099-12-31' } });
        fireEvent.click(screen.getByRole('button', { name: 'Güncelle' }));

        await waitFor(() => expect(api.updateFollowUp).toHaveBeenCalledWith(
            'f-1', 'fu-1',
            expect.objectContaining({
                result: 'YENI_AKSIYON_GEREKLI',
                resolutionOutcome: 'YENI_AKSIYON_GEREKLI',
                newFollowUpDate: null,
                newAction: { description: 'Kalıcı düzeltici aksiyon', directorateId: 'dir-1', dueDate: '2099-12-31' },
            }),
        ));
    });

    it('read-only takipte güncelleme aksiyonu göstermez', () => {
        render(
            <FindingFollowUpModal
                isOpen readOnly findingId="f-1" followUp={followUp}
                actions={[]} onClose={jest.fn()} onSuccess={jest.fn()}
            />,
        );

        expect(screen.queryByRole('button', { name: 'Güncelle' })).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Takip Çalışması' })).toBeInTheDocument();
    });
});
