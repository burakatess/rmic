import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddActionModal from '@/components/modals/AddActionModal';
import api from '@/lib/api';

jest.mock('@/lib/api', () => ({ __esModule: true, default: { getUsers: jest.fn().mockResolvedValue([]) } }));

describe('Aksiyon tamamlama formu', () => {
  it('backend hatasında açıklama ve form değerlerini korur, başarı gibi kapanmaz', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('Kanıt bu aksiyona bağlı değil'));
    const onClose = jest.fn();
    render(<AddActionModal isOpen findingId="f1" onClose={onClose} onSubmit={onSubmit} action={{ id: 'a1', description: 'Mevcut aksiyon açıklaması yeterince uzun.', ownerId: 'u1', dueDate: '2099-12-31', status: 'DEVAM_EDIYOR' }} />);
    const description = screen.getByPlaceholderText('Gerçekleştirilecek aksiyon adımlarını detaylıca açıklayın...');
    await userEvent.clear(description);
    await userEvent.type(description, 'Kullanıcının düzenlediği ve kaybolmaması gereken açıklama.');
    await userEvent.click(screen.getByRole('button', { name: 'Değişiklikleri Kaydet' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Kanıt bu aksiyona bağlı değil');
    expect(description).toHaveValue('Kullanıcının düzenlediği ve kaybolmaması gereken açıklama.');
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(api.getUsers).toHaveBeenCalled());
  });
});
