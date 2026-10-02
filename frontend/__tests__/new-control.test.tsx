import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NewControlPage from '@/app/(dashboard)/controls/new/page';
import { ToastProvider } from '@/components/ui/Toast';
import api from '@/lib/api';

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/lib/api', () => ({
    __esModule: true,
    default: {
        getUsers: jest.fn().mockResolvedValue([]),
        getDirectorates: jest.fn().mockResolvedValue([{ id: 'dir-1', name: 'Test Direktörlüğü' }]),
        createControl: jest.fn(() => new Promise(() => undefined)),
    },
}));

describe('Yeni kontrol kayıt güvenliği', () => {
    it('Due Date göstermez ve plan kapsamı oluşana kadar salt okunur Pasif durumunu gösterir', async () => {
        render(<ToastProvider><NewControlPage /></ToastProvider>);

        expect(await screen.findByLabelText('Kontrol durumu')).toHaveTextContent('Pasif');
        expect(screen.queryByText(/Due Date/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('combobox', { name: /Durum/i })).not.toBeInTheDocument();
    });

    it('çift tıklamada yalnız bir create isteği gönderir', async () => {
        render(<ToastProvider><NewControlPage /></ToastProvider>);
        fireEvent.change(screen.getByPlaceholderText('BTK.0001'), { target: { value: 'BTK.9999' } });
        const option = await screen.findByRole('option', { name: 'Test Direktörlüğü' });
        fireEvent.change(option.parentElement as HTMLSelectElement, { target: { value: 'dir-1' } });

        const save = screen.getByRole('button', { name: 'Kaydet' });
        fireEvent.click(save);
        fireEvent.click(save);

        await waitFor(() => expect(api.createControl).toHaveBeenCalledTimes(1));
        expect(api.createControl).toHaveBeenCalledWith(expect.not.objectContaining({
            dueDate: expect.anything(),
            status: expect.anything(),
            isActive: expect.anything(),
        }));
        expect(save).toBeDisabled();
    });
});
