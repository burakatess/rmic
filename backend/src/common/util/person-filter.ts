export const parseMultiValue = (value?: string): string[] =>
    (value || '').split(',').map(v => v.trim()).filter(Boolean).slice(0, 100);

export function personFieldWhere(field: string, value?: string, mineUserId?: string): Record<string, unknown> | undefined {
    const values = parseMultiValue(value).map(v => v === '__MINE__' ? mineUserId : v).filter(Boolean) as string[];
    if (!values.length) return undefined;
    const wantsUnassigned = values.includes('__UNASSIGNED__');
    const ids = values.filter(v => v !== '__UNASSIGNED__');
    if (wantsUnassigned && ids.length) return { OR: [{ [field]: { in: ids } }, { [field]: null }] };
    if (wantsUnassigned) return { [field]: null };
    return { [field]: { in: ids } };
}
