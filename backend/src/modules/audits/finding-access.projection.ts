/**
 * Bulgunun yalnız bir aksiyonuna/takibine atanmış (PARTIAL erişimli) kullanıcı için
 * detay projeksiyonu: işin yapılması için gereken üst bilgi korunur; diğer aksiyonlar,
 * takipler, kanıtlar, durum günlüğü ve ilişkili kayıtlar — sayıları dahil — gösterilmez.
 */
const HEADER_FIELDS = [
    'id', 'findingId', 'summary', 'description', 'severity', 'findingType', 'status',
    'workflowStatus', 'resolutionStatus', 'targetResolutionDate', 'testDate', 'directorateId',
    'relatedDepartment', 'createdAt', 'updatedAt',
    // projectFindingStatus çıktıları
    'displayStatus', 'timingStatus',
] as const;

export function projectPartialFinding(finding: any, userId: string) {
    const ownActions = (finding.actions ?? []).filter((a: any) => a.ownerId === userId);
    const ownActionIds = new Set(ownActions.map((a: any) => a.id));
    const ownFollowUps = (finding.followUps ?? []).filter((f: any) =>
        (f.actionId && ownActionIds.has(f.actionId))
        || f.assigneeId === userId || f.evaluatorId === userId || f.secondControllerId === userId);

    const header: Record<string, unknown> = {};
    for (const key of HEADER_FIELDS) if (key in finding) header[key] = finding[key];

    return {
        ...header,
        accessLevel: 'PARTIAL',
        control: finding.control ? { id: finding.control.id, controlId: finding.control.controlId, name: finding.control.name } : null,
        actions: ownActions,
        followUps: ownFollowUps,
        attachments: [],
        statusLogs: [],
        linkedRisks: [],
        referencingTests: [],
        risk: null,
        controlTest: null,
        auditExecution: null,
        currentStatusSummary: null,
        _count: { actions: ownActions.length, followUps: ownFollowUps.length, linkedRisks: 0, attachments: 0 },
    };
}
