import { InvalidCredentialsError } from 'ldapts';
import { describeLdapError, escapeLdapFilter } from './ldap.service';

describe('LDAP yardımcıları', () => {
    it('RFC 4515 kaçışı: * ( ) \\ ve NUL kaçışlanır (filtre enjeksiyonu yok)', () => {
        expect(escapeLdapFilter('a*)(uid=*')).toBe('a\\2a\\29\\28uid=\\2a');
        expect(escapeLdapFilter('x\\y\u0000')).toBe('x\\5cy\\00');
        expect(escapeLdapFilter('ayşe.ldap')).toBe('ayşe.ldap');
    });
    it('hata mesajları okunur ve iç ayrıntı sızdırmaz', () => {
        expect(describeLdapError(new InvalidCredentialsError('x'))).toContain('Kimlik bilgileri reddedildi');
        expect(describeLdapError({ code: 'ECONNREFUSED' })).toContain('erişilebilir değil');
        expect(describeLdapError({ code: 'ENOTFOUND' })).toContain('çözümlenemedi');
        expect(describeLdapError({ message: 'self-signed certificate in certificate chain' })).toContain('sertifika');
        expect(describeLdapError({ message: 'wrong version number' })).toContain('389');
        expect(describeLdapError({ name: 'WeirdError', message: '/secret/path stack' })).toBe('LDAP hatası: WeirdError');
    });
});
