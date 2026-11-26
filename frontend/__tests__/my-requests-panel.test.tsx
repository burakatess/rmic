import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MyRequestsPanel } from '@/components/approvals/MyRequestsPanel';
import api from '@/lib/api';

jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));
jest.mock('@/lib/api', () => ({
    __esModule: true,
    default: {
        getMyRequests: jest.fn(),
        withdrawDeletion: jest.fn().mockResolvedValue({ withdrawn: true }),
        workflowTransition: jest.fn().mockResolvedValue({}),
    },
}));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));

const items = [
    {
        kind: 'ACTION_APPROVAL', recordType: 'ACTION', recordId: 'a1', code: 'A-2027-0001-01', title: 'Erişimleri kaldır', link: '/actions/a1',
        submittedAt: new Date().toISOString(), reason: null, approvers: [{ id: 'u2', name: 'Ahmet Yılmaz' }], approverNote: null,
        withdraw: { via: 'WORKFLOW', entityType: 'ACTION' },
    },
    {
        kind: 'DELETION', recordType: 'CONTROL', recordId: 'c1', code: 'BTK.3005', title: 'Yanlış kontrol', link: '/controls/c1',
        submittedAt: new Date().toISOString(), reason: 'Mükerrer', approvers: [{ id: 'u2', name: 'Ahmet Yılmaz' }, { id: 'u3', name: 'Fatma Kaya' }],
        approverNote: 'Yönetici rolündeki kişilerden biri karar verir (talep eden hariç).', withdraw: { via: 'DELETION', type: 'CONTROL' },
    },
];

describe('Taleplerim paneli', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (api.getMyRequests as jest.Mock).mockResolvedValue({ items, decisions: [] });
    });

    it('her talepte kimin onayında olduğunu gösterir ve doğru uçtan geri çeker', async () => {
        render(<MyRequestsPanel />);
        const rows = await screen.findAllByTestId('my-request-row');
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent('Ahmet Yılmaz');
        expect(rows[1]).toHaveTextContent('Ahmet Yılmaz, Fatma Kaya');
        expect(rows[1]).toHaveTextContent('Kontrol');

        // Onay talebi: iş akışı WITHDRAW (not isteğe bağlı)
        fireEvent.click(within(rows[0]).getByRole('button', { name: 'Geri Çek' }));
        const dialog = await screen.findByRole('dialog');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Geri Çek' }));
        await waitFor(() => expect(api.workflowTransition).toHaveBeenCalledWith('ACTION', 'a1', 'WITHDRAW', undefined));

        // Silme talebi: silme geri çekme ucu, not ile
        fireEvent.click(within((await screen.findAllByTestId('my-request-row'))[1]).getByRole('button', { name: 'Geri Çek' }));
        const d2 = await screen.findByRole('dialog');
        fireEvent.change(within(d2).getByLabelText('Not (İsteğe Bağlı)'), { target: { value: 'Vazgeçtim' } });
        fireEvent.click(within(d2).getByRole('button', { name: 'Geri Çek' }));
        await waitFor(() => expect(api.withdrawDeletion).toHaveBeenCalledWith('CONTROL', 'c1', 'Vazgeçtim'));
    });
});
