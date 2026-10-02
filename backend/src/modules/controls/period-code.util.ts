/**
 * Dönem Kontrolü kodu — "{yıl}.{ana kontrol kodu}" (örn. 2027.BTK.0042).
 * Sayaç GEREKMEZ: ControlYearScope zaten @@unique([controlId, year]),
 * bu kod o ilişkiden BİREBİR türetildiği için kendiliğinden çakışmasız.
 */
export function computePeriodCode(controlCode: string, year: number): string {
    return `${year}.${controlCode}`;
}
