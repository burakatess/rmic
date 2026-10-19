import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { DirectorateScopeService } from '../../common/services/directorate-scope.service';
import { GlobalSearchCategory, GlobalSearchQueryDto } from './dto/global-search.dto';
import { matchesPermission } from '../../common/util/permission-match';

export interface GlobalSearchResult {
    id: string;
    type: 'risk' | 'control' | 'period-control' | 'control-test' | 'finding' | 'action' | 'follow-up';
    code: string;
    title: string;
    context: string;
    url: string;
}

@Injectable()
export class SearchService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly scopeService: DirectorateScopeService,
    ) {}

    async search(dto: GlobalSearchQueryDto, userId: string, permissions: string[]) {
        const query = dto.q.trim();
        const category = dto.category ?? GlobalSearchCategory.ALL;
        const limit = dto.limit ?? 12;
        const options = await this.scopeService.getScopeOptions(userId, permissions);
        const orgWide = options.org.available;
        const directorateIds = options.unit.directorates.map(d => d.id);
        const permissionFor: Partial<Record<GlobalSearchCategory, string>> = {
            [GlobalSearchCategory.RISK]: 'risk:view',
            [GlobalSearchCategory.CONTROL]: 'control:view',
            [GlobalSearchCategory.PERIOD_CONTROL]: 'control:view',
            [GlobalSearchCategory.CONTROL_TEST]: 'control:view',
            [GlobalSearchCategory.FINDING]: 'finding:view',
            [GlobalSearchCategory.ACTION]: 'action:view',
            [GlobalSearchCategory.FOLLOW_UP]: 'finding:view',
        };
        const selected = (value: GlobalSearchCategory) =>
            (category === GlobalSearchCategory.ALL || category === value)
            && matchesPermission(permissions, permissionFor[value]!);
        const contains = { contains: query, mode: 'insensitive' as const };
        const controlScope: any = orgWide ? {} : directorateIds.length
            ? { directorateId: { in: directorateIds } }
            : { ownerId: userId };
        const findingScope: any = orgWide ? {} : directorateIds.length
            ? { OR: [{ directorateId: { in: directorateIds } }, { assigneeId: userId }] }
            : { assigneeId: userId };
        const take = Math.min(limit, 20);

        const groups = await Promise.all([
            selected(GlobalSearchCategory.RISK) ? this.prisma.risk.findMany({
                where: { ...(orgWide ? {} : { ownerId: userId }), OR: [{ riskId: contains }, { name: contains }, { description: contains }, { ozet: contains }] },
                select: { id: true, riskId: true, name: true, description: true }, take,
            }).then(rows => rows.map(r => this.result('risk', r.id, r.riskId, r.name, r.description, `/risks/${r.id}`))) : [],
            selected(GlobalSearchCategory.CONTROL) ? this.prisma.control.findMany({
                where: { ...controlScope, OR: [{ controlId: contains }, { name: contains }, { description: contains }, { directorateRel: { name: contains } }] },
                select: { id: true, controlId: true, name: true, description: true, directorateRel: { select: { name: true } } }, take,
            }).then(rows => rows.map(r => this.result('control', r.id, r.controlId, r.name, this.context(r.description, r.directorateRel?.name), `/controls/${r.id}`))) : [],
            selected(GlobalSearchCategory.PERIOD_CONTROL) ? this.prisma.controlYearScope.findMany({
                where: { status: 'ACTIVE', control: controlScope, OR: [{ code: contains }, { snapshotName: contains }, { snapshotDescription: contains }, { control: { OR: [{ name: contains }, { description: contains }, { directorateRel: { name: contains } }] } }] },
                select: { id: true, code: true, snapshotName: true, snapshotDescription: true, control: { select: { name: true, description: true, directorateRel: { select: { name: true } } } } }, take,
            }).then(rows => rows.map(r => this.result('period-control', r.id, r.code ?? '', r.snapshotName ?? r.control.name, this.context(r.snapshotDescription ?? r.control.description, r.control.directorateRel?.name), `/controls/agenda/${r.id}`))) : [],
            selected(GlobalSearchCategory.CONTROL_TEST) ? this.prisma.controlTest.findMany({
                where: { control: controlScope, OR: [{ testNo: contains }, { summary: contains }, { description: contains }, { control: { OR: [{ name: contains }, { description: contains }] } }, { directorate: { name: contains } }] },
                select: { id: true, testNo: true, summary: true, description: true, control: { select: { name: true } }, directorate: { select: { name: true } } }, take,
            }).then(rows => rows.map(r => this.result('control-test', r.id, r.testNo, r.summary ?? r.control.name, this.context(r.description, r.directorate?.name), `/controls/testing/${r.id}`))) : [],
            selected(GlobalSearchCategory.FINDING) ? this.prisma.finding.findMany({
                where: { AND: [findingScope, { OR: [{ findingId: contains }, { summary: contains }, { description: contains }, { directorateRel: { name: contains } }] }] },
                select: { id: true, findingId: true, summary: true, description: true, directorateRel: { select: { name: true } } }, take,
            }).then(rows => rows.map(r => this.result('finding', r.id, r.findingId, r.summary ?? r.description, this.context(r.description, r.directorateRel?.name), `/findings/${r.id}`))) : [],
            selected(GlobalSearchCategory.ACTION) ? this.prisma.action.findMany({
                where: { finding: findingScope, OR: [{ actionId: contains }, { description: contains }, { directorate: { name: contains } }] },
                select: { id: true, actionId: true, description: true, directorate: { select: { name: true } }, finding: { select: { findingId: true } } }, take,
            }).then(rows => rows.map(r => this.result('action', r.id, r.actionId, r.description, this.context(`Bulgu: ${r.finding.findingId}`, r.directorate?.name), `/actions/${r.id}`))) : [],
            selected(GlobalSearchCategory.FOLLOW_UP) ? this.prisma.findingFollowUp.findMany({
                where: { finding: findingScope, OR: [{ followUpId: contains }, { explanation: contains }, { currentStatusDetail: contains }, { directorate: { name: contains } }] },
                select: { id: true, followUpId: true, explanation: true, currentStatusDetail: true, findingId: true, directorate: { select: { name: true } }, finding: { select: { findingId: true } } }, take,
            }).then(rows => rows.map(r => this.result('follow-up', r.id, r.followUpId, r.explanation ?? r.currentStatusDetail ?? `Takip ${r.followUpId}`, this.context(`Bulgu: ${r.finding.findingId}`, r.directorate?.name), `/findings/${r.findingId}?tab=takip&followUpId=${r.id}`))) : [],
        ]);

        const foldedQuery = this.fold(query);
        const data = groups.flat().sort((a, b) => {
            const rank = (item: GlobalSearchResult) => this.fold(item.code) === foldedQuery ? 0 : this.fold(item.code).startsWith(foldedQuery) ? 1 : 2;
            return rank(a) - rank(b) || a.code.localeCompare(b.code, 'tr');
        }).slice(0, limit);
        return { data, query, category };
    }

    private result(type: GlobalSearchResult['type'], id: string, code: string, title: string, context: string | null | undefined, url: string): GlobalSearchResult {
        return { id, type, code, title, context: (context ?? '').slice(0, 240), url };
    }

    private context(text?: string | null, directorate?: string | null) {
        return [directorate, text].filter(Boolean).join(' · ');
    }

    private fold(value: string) {
        return value.trim().toLocaleLowerCase('tr-TR');
    }
}
