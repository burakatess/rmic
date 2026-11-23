/**
 * Birim testleri için: `prisma.$transaction(cb)` çağrısını, geri çağrıyı AYNI sahte nesneyle
 * çalıştırarak taklit eder. Servisler ana kayıt + denetim kaydını tek işlemde yazdığından
 * sahte Prisma nesnesine bu kalıp gerekir (`useValue: withTx(prisma)`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const withTx = <T extends object>(p: T): T => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p as any).$transaction = jest.fn((arg: unknown) => (typeof arg === 'function' ? (arg as (tx: T) => unknown)(p) : Promise.all(arg as unknown[])));
    // Ortak iş akışı geçiş geçmişi (workflow-stages.logTransition) — sahte nesnede yoksa eklenir.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(p as any).workflowTransition) (p as any).workflowTransition = { create: jest.fn().mockResolvedValue({}) };
    return p;
};
