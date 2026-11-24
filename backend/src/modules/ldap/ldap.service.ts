import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, InvalidCredentialsError, type Entry } from 'ldapts';
import type { LdapConnection } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { decryptSecret, encryptSecret, loadSettingsKey, SecretKeyMissingError } from '../../common/util/secret-crypto';

/** Bağlantı ayarları (kayıtlı veya kaydedilmemiş — test için). Şifre düz metin yalnız bellekte. */
export interface LdapSettings {
    host: string; protocol: 'LDAP' | 'LDAPS'; port: number; startTls: boolean; tlsRejectUnauthorized: boolean;
    caCertificate?: string | null; baseDn: string; bindDn?: string | null; bindPassword?: string | null;
    userFilter: string; usernameAttribute: string; emailAttribute: string; firstNameAttribute: string; lastNameAttribute: string;
    departmentAttribute?: string | null; timeoutMs: number;
}
export interface DirectoryUser { dn: string; username: string; email: string | null; firstName: string; lastName: string; department: string | null }
export type LdapAuthResult = { ok: true; dn: string; entry: DirectoryUser } | { ok: false; reason: 'INVALID_PASSWORD' | 'USER_NOT_FOUND' | 'UNAVAILABLE'; detail?: string };

export const DEFAULT_PORTS = { LDAP: 389, LDAPS: 636 } as const;

/** RFC 4515 filtre kaçışı — kullanıcı girdisi filtreye asla ham eklenmez (LDAP enjeksiyonu). */
export function escapeLdapFilter(value: string): string {
    return value.replace(/[\\*()\u0000]/g, c => `\\${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

const first = (v: unknown): string | null => {
    const x = Array.isArray(v) ? v[0] : v;
    if (x === undefined || x === null) return null;
    const s = Buffer.isBuffer(x) ? x.toString('utf8') : String(x);
    return s.trim() || null;
};

/** Bağlantı hatasını yöneticiye okunur, iç ayrıntı sızdırmayan mesaja çevirir. */
export function describeLdapError(e: unknown): string {
    const err = e as { code?: string | number; message?: string; name?: string };
    if (e instanceof InvalidCredentialsError) return 'Kimlik bilgileri reddedildi (servis hesabı DN veya şifresi hatalı).';
    const code = typeof err?.code === 'string' ? err.code : '';
    if (code === 'ECONNREFUSED') return 'Bağlantı reddedildi: sunucu/port erişilebilir değil.';
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Sunucu adı çözümlenemedi.';
    if (code === 'ETIMEDOUT' || /timeout/i.test(err?.message ?? '')) return 'Zaman aşımı: sunucu yanıt vermedi.';
    if (/certificate|self[- ]signed|CERT_|unable to verify/i.test(`${code} ${err?.message ?? ''}`)) return 'TLS sertifikası doğrulanamadı (CA sertifikası ekleyin veya sertifikayı kontrol edin).';
    if (/wrong version number|EPROTO|ECONNRESET/i.test(`${code} ${err?.message ?? ''}`)) return 'TLS el sıkışması başarısız (protokol/port uyuşmuyor olabilir: LDAP 389, LDAPS 636).';
    if (err?.name === 'NoSuchObjectError') return 'Temel DN dizinde bulunamadı.';
    return `LDAP hatası: ${err?.name ?? 'bilinmeyen'}`;
}

/**
 * LDAP / Active Directory istemcisi: bağlantı testi, dizinde kullanıcı arama ve kimlik doğrulama.
 * Kullanıcı şifresi yalnız bind için kullanılır; hiçbir yere yazılmaz/loglanmaz.
 */
@Injectable()
export class LdapService {
    private readonly logger = new Logger(LdapService.name);
    constructor(private prisma: PrismaService, private config: ConfigService) { }

    private key() { return loadSettingsKey(this.config.get<string>('SETTINGS_ENCRYPTION_KEY')); }

    encryptBindPassword(plain: string): string {
        try { return encryptSecret(plain, this.key()); }
        catch (e) {
            if (e instanceof SecretKeyMissingError) throw new BadRequestException('Servis hesabı şifresi saklanamıyor: sunucuda SETTINGS_ENCRYPTION_KEY tanımlı değil.');
            throw e;
        }
    }

    /** Kayıtlı bağlantı → çalışma ayarı (servis hesabı şifresi çözülür). */
    settingsOf(c: LdapConnection): LdapSettings {
        let bindPassword: string | null = null;
        if (c.bindPasswordEnc) {
            try { bindPassword = decryptSecret(c.bindPasswordEnc, this.key()); }
            catch { throw new BadRequestException('Servis hesabı şifresi çözülemedi (SETTINGS_ENCRYPTION_KEY değişmiş olabilir); şifreyi yeniden girin.'); }
        }
        return { ...c, protocol: c.protocol, bindPassword };
    }

    async loadConnection(id: string) {
        const c = await this.prisma.ldapConnection.findUnique({ where: { id } });
        if (!c) throw new NotFoundException('LDAP bağlantısı bulunamadı');
        return c;
    }

    private async client(s: LdapSettings): Promise<Client> {
        const tlsOptions = { rejectUnauthorized: s.tlsRejectUnauthorized, servername: s.host, ...(s.caCertificate ? { ca: [s.caCertificate] } : {}) };
        const client = new Client({
            url: `${s.protocol === 'LDAPS' ? 'ldaps' : 'ldap'}://${s.host}:${s.port}`,
            timeout: s.timeoutMs, connectTimeout: s.timeoutMs,
            ...(s.protocol === 'LDAPS' ? { tlsOptions } : {}),
        });
        if (s.protocol === 'LDAP' && s.startTls) await client.startTLS(tlsOptions);
        return client;
    }

    private async serviceBind(client: Client, s: LdapSettings) {
        if (s.bindDn) await client.bind(s.bindDn, s.bindPassword ?? '');
    }

    private toUser(e: Entry, s: LdapSettings): DirectoryUser {
        return {
            dn: e.dn,
            username: first(e[s.usernameAttribute]) ?? first(e.uid) ?? first(e.sAMAccountName) ?? '',
            email: first(e[s.emailAttribute]),
            firstName: first(e[s.firstNameAttribute]) ?? first(e.cn) ?? '',
            lastName: first(e[s.lastNameAttribute]) ?? '',
            department: s.departmentAttribute ? first(e[s.departmentAttribute]) : null,
        };
    }
    private attrs(s: LdapSettings) {
        return [...new Set([s.usernameAttribute, s.emailAttribute, s.firstNameAttribute, s.lastNameAttribute, s.departmentAttribute, 'cn', 'uid', 'sAMAccountName'].filter((x): x is string => !!x))];
    }

    /** Bağlantı testi: (StartTLS) + servis hesabıyla bind + temel DN'de tek kayıt araması. */
    async test(s: LdapSettings): Promise<{ ok: boolean; message: string; ms: number }> {
        const t0 = Date.now();
        let client: Client | null = null;
        try {
            client = await this.client(s);
            await this.serviceBind(client, s);
            await client.search(s.baseDn, { scope: 'base', filter: '(objectClass=*)', attributes: ['dn'], sizeLimit: 1 });
            return { ok: true, message: `Bağlantı başarılı (${s.protocol}${s.protocol === 'LDAP' && s.startTls ? '+StartTLS' : ''}, port ${s.port}).`, ms: Date.now() - t0 };
        } catch (e) {
            return { ok: false, message: describeLdapError(e), ms: Date.now() - t0 };
        } finally {
            await client?.unbind().catch(() => undefined);
        }
    }

    /** Dizinde kullanıcı arama (yönetici ekleme ekranı). En çok `limit` kayıt. */
    async search(s: LdapSettings, q: string, limit = 25): Promise<DirectoryUser[]> {
        const term = escapeLdapFilter(q.trim());
        if (term.length < 2) throw new BadRequestException('Arama için en az 2 karakter girin.');
        const filter = `(&(|(objectClass=person)(objectClass=user)(objectClass=inetOrgPerson))(|(${s.usernameAttribute}=*${term}*)(cn=*${term}*)(${s.emailAttribute}=*${term}*)(${s.firstNameAttribute}=*${term}*)(${s.lastNameAttribute}=*${term}*)))`;
        let client: Client | null = null;
        try {
            client = await this.client(s);
            await this.serviceBind(client, s);
            const { searchEntries } = await client.search(s.baseDn, { scope: 'sub', filter, attributes: this.attrs(s), sizeLimit: limit });
            return searchEntries.map(e => this.toUser(e, s)).filter(u => u.username);
        } catch (e) {
            if ((e as { name?: string })?.name === 'SizeLimitExceededError') return [];
            throw new BadRequestException(describeLdapError(e));
        } finally {
            await client?.unbind().catch(() => undefined);
        }
    }

    /** Kullanıcı adıyla tek kayıt (userFilter, {{username}} kaçışlanarak). */
    async findUser(s: LdapSettings, username: string): Promise<DirectoryUser | null> {
        let client: Client | null = null;
        try {
            client = await this.client(s);
            await this.serviceBind(client, s);
            return await this.lookup(client, s, username);
        } finally {
            await client?.unbind().catch(() => undefined);
        }
    }

    private async lookup(client: Client, s: LdapSettings, username: string): Promise<DirectoryUser | null> {
        const filter = s.userFilter.split('{{username}}').join(escapeLdapFilter(username));
        const { searchEntries } = await client.search(s.baseDn, { scope: 'sub', filter, attributes: this.attrs(s), sizeLimit: 2 });
        if (searchEntries.length !== 1) return null; // yok veya belirsiz (birden fazla eşleşme)
        return this.toUser(searchEntries[0], s);
    }

    /**
     * Kimlik doğrulama: servis hesabıyla kullanıcıyı bul (yoksa son bilinen DN), sonra kullanıcının
     * DN'i ve şifresiyle ayrı bir bind. Boş şifre reddedilir (LDAP'ta boş şifreyle "anonim bind" başarılı olur).
     */
    async authenticate(s: LdapSettings, username: string, password: string, knownDn?: string | null): Promise<LdapAuthResult> {
        if (!password) return { ok: false, reason: 'INVALID_PASSWORD' };
        let entry: DirectoryUser | null = null;
        let svc: Client | null = null;
        try {
            svc = await this.client(s);
            await this.serviceBind(svc, s);
            entry = await this.lookup(svc, s, username);
        } catch (e) {
            this.logger.warn(`LDAP kullanıcı araması başarısız: ${describeLdapError(e)}`);
            if (!knownDn) return { ok: false, reason: 'UNAVAILABLE', detail: describeLdapError(e) };
        } finally {
            await svc?.unbind().catch(() => undefined);
        }
        const dn = entry?.dn ?? knownDn;
        if (!dn) return { ok: false, reason: 'USER_NOT_FOUND' };
        let userClient: Client | null = null;
        try {
            userClient = await this.client(s);
            await userClient.bind(dn, password);
            return { ok: true, dn, entry: entry ?? { dn, username, email: null, firstName: '', lastName: '', department: null } };
        } catch (e) {
            if (e instanceof InvalidCredentialsError) return { ok: false, reason: 'INVALID_PASSWORD' };
            return { ok: false, reason: 'UNAVAILABLE', detail: describeLdapError(e) };
        } finally {
            await userClient?.unbind().catch(() => undefined);
        }
    }
}
