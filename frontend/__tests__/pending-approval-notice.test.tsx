import { render, screen } from '@testing-library/react';
import { PendingApprovalNotice } from '@/components/approvals/PendingApprovalNotice';

describe('PendingApprovalNotice — kimin onaylayacağı açık yazılır', () => {
    it('onaycı adı, rolü ve göndereni gösterir', () => {
        render(<PendingApprovalNotice title="Aksiyon onay bekliyor" waitingFor={[{ name: 'Ayşe Yönetici', role: '2. kontrolcü' }]} sentBy="Kemal Planlayıcı" sentAt={new Date(Date.now() - 3 * 3600000).toISOString()} />);
        const n = screen.getByTestId('pending-approval');
        expect(n).toHaveTextContent('Aksiyon onay bekliyor');
        expect(n).toHaveTextContent('Onaylayacak: Ayşe Yönetici (2. kontrolcü)');
        expect(n).toHaveTextContent('Gönderen: Kemal Planlayıcı');
        expect(n).toHaveTextContent('3 saat önce');
    });
    it('birden fazla onaycıyı listeler', () => {
        render(<PendingApprovalNotice title="Plan" waitingFor={[{ name: 'A' }, { name: 'B' }]} />);
        expect(screen.getByTestId('pending-approval')).toHaveTextContent('Onaylayacak: A, B');
    });
    it('onaycı yoksa uyarır (işlem ilerlemez)', () => {
        render(<PendingApprovalNotice title="Test onay bekliyor" waitingFor={[]} />);
        expect(screen.getByTestId('pending-approval')).toHaveTextContent('yetkili kullanıcı bulunamadı');
    });
});
