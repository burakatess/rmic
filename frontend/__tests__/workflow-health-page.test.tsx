import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WorkflowHealthPage from '@/app/(dashboard)/workflow-health/page';
import api from '@/lib/api';

jest.mock('@/lib/api', () => ({
    __esModule: true,
    ApiError: class ApiError extends Error { },
    default: { getWorkflowHealthSummary: jest.fn(), getWorkflowHealthItems: jest.fn() },
}));

const item = (n: number) => ({ code: 'ACTION_OVERDUE', severity: 'CRITICAL', entityType: 'ACTION', entityId: `a${n}`, title: `A-${n}`, message: 'Gecikti', nextAction: 'X', href: `/actions/a${n}` });
const summary = { critical: 60, warning: 0, overdue: 60, pendingApproval: 0, outdatedVersion: 0, byCode: { ACTION_OVERDUE: 60 } };

describe('Akış Sağlığı — sayfalama', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (api.getWorkflowHealthSummary as jest.Mock).mockResolvedValue(summary);
        (api.getWorkflowHealthItems as jest.Mock).mockImplementation(async (p: { page: number; pageSize: number }) => ({
            data: Array.from({ length: Math.min(p.pageSize, 60 - (p.page - 1) * p.pageSize) }, (_, i) => item((p.page - 1) * p.pageSize + i + 1)),
            pagination: { total: 60, totalPages: Math.ceil(60 / p.pageSize), page: p.page, pageSize: p.pageSize },
        }));
    });

    it('60 kayıt 25\'erli sayfalanır; toplam ve aralık gösterilir (ilk 50 sessizce kesilmez)', async () => {
        render(<WorkflowHealthPage />);
        const pager = await screen.findByTestId('health-pager');
        expect(pager).toHaveTextContent('1–25 / 60 kayıt');
        expect(screen.getByRole('button', { name: 'Önceki' })).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }));
        await waitFor(() => expect(screen.getByTestId('health-pager')).toHaveTextContent('26–50 / 60 kayıt'));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Sonraki' })).not.toBeDisabled()); // yükleme bitince
        fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }));
        await waitFor(() => expect(screen.getByTestId('health-pager')).toHaveTextContent('51–60 / 60 kayıt'));
        expect(screen.getByRole('button', { name: 'Sonraki' })).toBeDisabled();
        expect(screen.getByText('A-60')).toBeInTheDocument();
    });

    it('filtre değişince ilk sayfaya döner', async () => {
        render(<WorkflowHealthPage />);
        await screen.findByTestId('health-pager');
        fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }));
        await waitFor(() => expect(screen.getByTestId('health-pager')).toHaveTextContent('26–50'));
        fireEvent.change(screen.getByDisplayValue('Tüm önem seviyeleri'), { target: { value: 'CRITICAL' } });
        await waitFor(() => expect(api.getWorkflowHealthItems).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, severity: 'CRITICAL' })));
    });
});
