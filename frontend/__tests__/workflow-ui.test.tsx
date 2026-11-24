import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkflowBar } from '@/components/workflow/WorkflowBar';
import WorkflowBoardPage from '@/app/(dashboard)/workflow/page';
import { buildFindingReferenceText, textReferencesAll } from '@/components/controls/TestFindingLinks';
import api from '@/lib/api';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));
jest.mock('@/lib/api', () => ({
    __esModule: true,
    ApiError: class ApiError extends Error { body: unknown; constructor(m: string, _s: number, b?: unknown) { super(m); this.body = b; } },
    default: { getWorkflowState: jest.fn(), workflowTransition: jest.fn(), getWorkflowBoard: jest.fn(), moveWorkflowCard: jest.fn() },
}));

const stages = [{ key: 'BEKLIYOR', label: 'Bekliyor' }, { key: 'DEVAM_EDIYOR', label: 'Devam Ediyor' }, { key: 'TAMAMLANDI', label: 'Tamamlandı' }, { key: 'ONAYLANDI', label: 'Onaylandı' }];
const baseState = {
    entityType: 'CONTROL_TEST', entityId: 't1', code: '2026.T1', title: 'Test', href: '/controls/testing/t1', rawStatus: 'TAMAMLANDI',
    stage: 'TAMAMLANDI', stageLabel: 'Tamamlandı', stages,
    assignee: { id: 'u1', name: 'Kemal Yapan' }, checker: { id: 'u2', name: 'Ayşe Onaylayan' }, submittedBy: { id: 'u1', name: 'Kemal Yapan' },
    actions: [{ action: 'APPROVE', label: 'Onayla', needsReason: false }, { action: 'RETURN', label: 'İade et', needsReason: true }],
    deletion: null,
    history: [{ id: 'h1', action: 'COMPLETE', actionLabel: 'Tamamla ve 2. kontrolcüye ilet', from: 'DEVAM_EDIYOR', to: 'TAMAMLANDI', fromLabel: 'Devam Ediyor', toLabel: 'Tamamlandı', reason: null, at: new Date().toISOString(), by: { id: 'u1', name: 'Kemal Yapan' } }],
};

describe('WorkflowBar', () => {
    beforeEach(() => jest.clearAllMocks());

    it('mevcut aşamayı, onaycıyı ve geçmişi gösterir; onay gerekçesiz, iade gerekçeli çalışır', async () => {
        (api.getWorkflowState as jest.Mock).mockResolvedValue(baseState);
        (api.workflowTransition as jest.Mock).mockResolvedValue({});
        render(<WorkflowBar type="CONTROL_TEST" id="t1" />);
        const bar = await screen.findByTestId('workflow-bar');
        expect(bar).toHaveAttribute('data-stage', 'TAMAMLANDI');
        expect(screen.getByText(/Tamamlandı/, { selector: 'li[aria-current="step"] span' })).toBeInTheDocument();
        expect(screen.getByTestId('pending-approval')).toHaveTextContent('Onaylayacak: Ayşe Onaylayan (2. kontrolcü)');

        fireEvent.click(screen.getByRole('button', { name: /Geçmiş \(1\)/ }));
        expect(screen.getByTestId('workflow-history')).toHaveTextContent('Devam Ediyor → Tamamlandı');

        fireEvent.click(screen.getByRole('button', { name: 'İade et' }));
        // Modal içindeki onay düğmesi gerekçe girilmeden kapalı.
        const dialogConfirm = screen.getAllByRole('button', { name: 'Onayla' }).find(b => b.closest('[role="dialog"]'))!;
        expect(dialogConfirm).toBeDisabled();
        fireEvent.change(screen.getByLabelText(/Gerekçe/), { target: { value: 'Kanıt eksik' } });
        fireEvent.click(dialogConfirm);
        await waitFor(() => expect(api.workflowTransition).toHaveBeenCalledWith('CONTROL_TEST', 't1', 'RETURN', 'Kanıt eksik'));
    });
});

describe('İşlem Durumları (Kanban)', () => {
    const card = (stage: string) => ({ entityType: 'CONTROL_TEST', entityId: `c-${stage}`, code: `T-${stage}`, title: `Kart ${stage}`, href: '/x', stage, rawStatus: stage, assignee: null, checker: null, plannedDate: null, updatedAt: new Date().toISOString() });
    beforeEach(() => {
        jest.clearAllMocks();
        (api.getWorkflowBoard as jest.Mock).mockResolvedValue({
            columns: ['BEKLIYOR', 'DEVAM_EDIYOR', 'TAMAMLANDI', 'ONAYLANDI'].map(st => ({ stage: st, label: st, total: st === 'BEKLIYOR' ? 1 : 0, items: st === 'BEKLIYOR' ? [card('BEKLIYOR')] : [] })),
            scope: 'MINE', canOrg: false, year: 2026,
        });
        (api.moveWorkflowCard as jest.Mock).mockResolvedValue({ action: 'START' });
    });

    it('sütun sayılarını gösterir; komşu aşamaya bırakmak taşır, aşama atlamak sunucuya hiç gitmez', async () => {
        render(<WorkflowBoardPage />);
        const c = await screen.findByText('Kart BEKLIYOR');
        expect(screen.getByTestId('count-BEKLIYOR')).toHaveTextContent('1');

        const cardEl = c.closest('[data-testid="board-card"]')!;
        fireEvent.dragStart(cardEl);
        fireEvent.dragOver(screen.getByTestId('column-ONAYLANDI'));
        fireEvent.drop(screen.getByTestId('column-ONAYLANDI'));
        expect(api.moveWorkflowCard).not.toHaveBeenCalled();

        fireEvent.dragStart(cardEl);
        fireEvent.dragOver(screen.getByTestId('column-DEVAM_EDIYOR'));
        fireEvent.drop(screen.getByTestId('column-DEVAM_EDIYOR'));
        await waitFor(() => expect(api.moveWorkflowCard).toHaveBeenCalledWith('CONTROL_TEST', 'c-BEKLIYOR', 'DEVAM_EDIYOR', undefined));
    });
});

describe('Bulgu referans metni', () => {
    it('tek ve çoklu bulgu için ifade üretir; metin kontrolü bağlı tüm numaraları arar', () => {
        expect(buildFindingReferenceText([{ findingId: 'B-2026-0001' }])).toBe('Gerçekleştirilen kontrol kapsamında değerlendirilen hususun, sistemde kayıtlı B-2026-0001 numaralı bulgu ile ilişkili olduğu belirlenmiş olup, ilgili husus söz konusu bulgu kapsamında takip edilmektedir.');
        expect(buildFindingReferenceText([{ findingId: 'A' }, { findingId: 'B' }, { findingId: 'C' }])).toContain('A, B ve C numaralı bulgular');
        expect(textReferencesAll('... A ve B ...', [{ findingId: 'A' }, { findingId: 'B' }])).toBe(true);
        expect(textReferencesAll('... A ...', [{ findingId: 'A' }, { findingId: 'B' }])).toBe(false);
    });
});
