import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { isKnownPermission, LEGACY_PERMISSION_MAP, PERMISSION_CATALOG, PERMISSION_GROUPS } from './permission-catalog';
import { matchesPermission } from '../util/permission-match';
import { SYSTEM_ROLES } from '../../../prisma/system-roles';

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name.startsWith('.')) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(ts|tsx)$/.test(name) && !/\.spec\.ts$/.test(name)) out.push(p);
    }
    return out;
}

const ROOT = join(__dirname, '../../../..');

describe('İzin kataloğu', () => {
    it('anahtarlar benzersiz ve her biri tanımlı bir gruba ait', () => {
        const keys = PERMISSION_CATALOG.map(p => p.key);
        expect(new Set(keys).size).toBe(keys.length);
        const groups = new Set(PERMISSION_GROUPS.map(g => g.key));
        for (const p of PERMISSION_CATALOG) expect(groups.has(p.group)).toBe(true);
    });

    it('joker karakterler: *, katalogdaki kaynak için kaynak:* kabul; bilinmeyen kaynak reddedilir', () => {
        expect(isKnownPermission('*')).toBe(true);
        expect(isKnownPermission('finding:*')).toBe(true);
        expect(isKnownPermission('risk:*')).toBe(true);
        expect(isKnownPermission('admin:*')).toBe(false);
        expect(isKnownPermission('finding:read')).toBe(false);
        expect(isKnownPermission('finding:view')).toBe(true);
    });

    it('joker davranışı korunur: risk:* alt izinleri (risk:sim:view) kapsar, * her şeyi kapsar', () => {
        expect(matchesPermission(['risk:*'], 'risk:sim:view')).toBe(true);
        expect(matchesPermission(['risk:*'], 'finding:view')).toBe(false);
        expect(matchesPermission(['*'], 'scope:org')).toBe(true);
        expect(matchesPermission(['scope:org:risk'], 'scope:org')).toBe(false);
    });

    it('tüm sistem rolü varsayılanları katalogda', () => {
        for (const r of SYSTEM_ROLES) {
            const unknown = r.permissions.filter(p => !isKnownPermission(p));
            expect({ role: r.name, unknown }).toEqual({ role: r.name, unknown: [] });
        }
    });

    it('eski anahtar eşlemesinin hedefleri katalogda; eski anahtarlar katalogda DEĞİL', () => {
        for (const [legacy, m] of Object.entries(LEGACY_PERMISSION_MAP)) {
            expect(isKnownPermission(legacy)).toBe(false);
            if (m.target) expect(isKnownPermission(m.target)).toBe(true);
        }
    });

    // Kaynak taraması: backend guard/servis kontrolleri ve frontend kapıları yalnız
    // katalogdaki anahtarları kullanabilir (elle tutulan farklı liste kalmasın).
    it('backend ve frontend kaynak kodundaki izin anahtarları katalogda', () => {
        const patterns = [
            /@Require(?:Any)?Permissions?\(([^)]*)\)/g,
            /matchesPermission\([^,]+,\s*'([^']+)'\)/g,
            /assertViewPermission\([^,]+,\s*'([^']+)'/g,
            /hasPermission\('([^']+)'\)/g,
            /hasAnyPermission\(\[([^\]]*)\]\)/g,
            /permission[=:]\s*["']([a-z_]+:[a-z_*:]+)["']/g,
        ];
        const files = [...walk(join(ROOT, 'backend/src')), ...walk(join(ROOT, 'frontend/src'))];
        const found = new Map<string, string>();
        for (const f of files) {
            const src = readFileSync(f, 'utf8');
            for (const re of patterns) {
                for (const m of src.matchAll(re)) {
                    for (const k of m[1].match(/[a-z_]+:[a-z_*:]+|(?<=['"])\*(?=['"])/g) ?? []) found.set(k, f.replace(ROOT + '/', ''));
                }
            }
        }
        const unknown = [...found.entries()].filter(([k]) => !isKnownPermission(k)).map(([k, f]) => `${k} (${f})`);
        expect(unknown).toEqual([]);
        expect(found.size).toBeGreaterThan(15);
    });
});
