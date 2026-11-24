import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LdapConnectionsPanel } from '@/components/admin/LdapConnectionsPanel';
import { LdapUserImport } from '@/components/admin/LdapUserImport';
import api from '@/lib/api';

jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));
jest.mock('@/lib/api', () => ({
    __esModule: true,
    default: { getLdapConnections: jest.fn(), createLdapConnection: jest.fn(), testLdapDraft: jest.fn(), searchLdapDirectory: jest.fn(), createLdapUser: jest.fn() },
}));

const conn = { id: 'c1', name: 'Kurum AD', host: 'dc01', protocol: 'LDAPS', port: 636, startTls: false, isActive: true, baseDn: 'dc=k', userCount: 0, hasBindPassword: true, lastTestOk: null };

describe('LDAP yönetimi', () => {
    beforeEach(() => jest.clearAllMocks());

    it('bağlantı formu: LDAP seçilince port 389, LDAPS seçilince 636; özel port korunur; StartTLS yalnız LDAP\'ta', async () => {
        (api.getLdapConnections as jest.Mock).mockResolvedValue([]);
        (api.createLdapConnection as jest.Mock).mockResolvedValue({});
        render(<LdapConnectionsPanel />);
        fireEvent.click(await screen.findByRole('button', { name: '+ Bağlantı ekle' }));
        const port = screen.getByLabelText('Port') as HTMLInputElement;
        expect(port.value).toBe('636');
        expect(screen.queryByText('StartTLS ile şifrele')).not.toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('LDAP (389)'));
        expect(port.value).toBe('389');
        expect(screen.getByText('StartTLS ile şifrele')).toBeInTheDocument();
        fireEvent.change(port, { target: { value: '3268' } });
        fireEvent.click(screen.getByLabelText('LDAPS (TLS, 636)'));
        expect(port.value).toBe('3268'); // özel port elle girilmişse korunur
        fireEvent.click(screen.getByRole('button', { name: /Varsayılana dön/ }));
        expect(port.value).toBe('636');
        fireEvent.change(screen.getByLabelText('Bağlantı adı *'), { target: { value: 'AD' } });
        fireEvent.change(screen.getByLabelText('Sunucu (ana bilgisayar adı / IP) *'), { target: { value: 'dc01.k.local' } });
        fireEvent.change(screen.getByLabelText('Temel DN (Base DN) *'), { target: { value: 'dc=k,dc=local' } });
        fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
        await waitFor(() => expect(api.createLdapConnection).toHaveBeenCalledWith(expect.objectContaining({ protocol: 'LDAPS', port: 636, host: 'dc01.k.local', bindPassword: undefined })));
    });

    it('LDAP\'tan ekle: ara → seç → rol → ekle; zaten ekli/e-postasız seçilemez', async () => {
        (api.getLdapConnections as jest.Mock).mockResolvedValue([conn]);
        (api.searchLdapDirectory as jest.Mock).mockResolvedValue([
            { dn: 'uid=a', username: 'ayse', email: 'a@k', firstName: 'Ayşe', lastName: 'D', department: null, alreadyExists: false, existingUserId: null },
            { dn: 'uid=b', username: 'baris', email: 'b@k', firstName: 'Barış', lastName: 'D', department: null, alreadyExists: true, existingUserId: 'u2' },
            { dn: 'uid=c', username: 'cem', email: null, firstName: 'Cem', lastName: 'D', department: null, alreadyExists: false, existingUserId: null },
        ]);
        (api.createLdapUser as jest.Mock).mockResolvedValue({});
        const onCreated = jest.fn();
        render(<LdapUserImport roles={[{ id: 'r1', name: 'AUDITOR' }]} roleLabel={n => n} onCreated={onCreated} onCancel={jest.fn()} />);
        fireEvent.change(await screen.findByLabelText('Dizinde ara'), { target: { value: 'di' } });
        fireEvent.click(screen.getByRole('button', { name: 'Ara' }));
        await screen.findByTestId('ldap-results');
        expect(api.searchLdapDirectory).toHaveBeenCalledWith('c1', 'di');
        expect(screen.getByLabelText('baris seç')).toBeDisabled();
        expect(screen.getByLabelText('cem seç')).toBeDisabled();
        fireEvent.click(screen.getByLabelText('ayse seç'));
        fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'r1' } });
        fireEvent.click(screen.getByRole('button', { name: 'LDAP kullanıcısını ekle' }));
        await waitFor(() => expect(api.createLdapUser).toHaveBeenCalledWith({ connectionId: 'c1', username: 'ayse', roleId: 'r1' }));
        expect(onCreated).toHaveBeenCalled();
    });
});
