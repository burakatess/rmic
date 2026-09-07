import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma';

const MONTHS = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

/** plannedDate + frekanstan okunabilir dönem etiketi. */
export function periodLabel(d: Date, frequency: string): string {
    const y = d.getFullYear();
    const m = d.getMonth();
    switch (frequency) {
        case 'QUARTERLY':
            return `${y} Q${Math.floor(m / 3) + 1}`;
        case 'SEMI_ANNUAL':
            return `${y} ${m < 6 ? 'H1' : 'H2'}`;
        case 'ANNUAL':
            return `${y}`;
        default:
            return `${MONTHS[m]} ${y}`;
    }
}

export interface LoadedTest {
    test: {
        id: string;
        testNo: string;
        plannedDate: Date;
        status: string;
        findingStatus: string | null;
        control: {
            id: string;
            controlId: string;
            name: string;
            description: string;
            type: string;
            nature: string;
            automation: string;
            frequency: string;
            controlPeriod: string | null;
            selectedMonths: string[];
            testSteps: string | null;
        };
    };
    attachments: {
        id: string;
        fileName: string;
        originalName: string;
        mimeType: string;
        sizeBytes: number;
    }[];
}

export async function loadTest(prisma: PrismaService, testId: string): Promise<LoadedTest> {
    const test = await prisma.controlTest.findUnique({
        where: { id: testId },
        select: {
            id: true,
            testNo: true,
            plannedDate: true,
            status: true,
            findingStatus: true,
            control: {
                select: {
                    id: true,
                    controlId: true,
                    name: true,
                    description: true,
                    type: true,
                    nature: true,
                    automation: true,
                    frequency: true,
                    controlPeriod: true,
                    selectedMonths: true,
                    testSteps: true,
                },
            },
            attachments: {
                select: { id: true, fileName: true, originalName: true, mimeType: true, sizeBytes: true },
                orderBy: { createdAt: 'asc' },
            },
        },
    });
    if (!test) throw new NotFoundException(`Kontrol testi ${testId} bulunamadı`);
    const { attachments, ...rest } = test;
    return { test: rest, attachments };
}

export async function loadLinkedRisks(prisma: PrismaService, controlId: string) {
    const rows = await prisma.controlRiskMapping.findMany({
        where: { controlId },
        select: { risk: { select: { riskId: true, name: true } } },
    });
    return rows.map((r) => ({ riskId: r.risk.riskId, title: r.risk.name }));
}

export async function loadRegulations(prisma: PrismaService, controlId: string) {
    const rows = await prisma.controlRegulation.findMany({
        where: { controlId },
        select: {
            article: {
                select: {
                    articleCode: true,
                    title: true,
                    regulation: { select: { code: true, name: true } },
                },
            },
        },
    });
    return rows.map((r) => ({
        code: `${r.article.regulation.code} md.${r.article.articleCode}`,
        title: r.article.title,
    }));
}

/** Bu kontrole (doğrudan ya da testleri üzerinden) bağlı bulgular — tekrar/referans analizi için. */
export async function loadControlFindings(prisma: PrismaService, controlId: string, excludeTestId: string) {
    const rows = await prisma.finding.findMany({
        where: {
            AND: [
                { OR: [{ controlId }, { controlTest: { controlId } }] },
                { controlTestId: { not: excludeTestId } },
            ],
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: {
            findingId: true,
            severity: true,
            status: true,
            description: true,
            recommendation: true,
        },
    });
    return rows.map((f) => ({
        findingId: f.findingId,
        severity: f.severity,
        status: f.status,
        description: f.description,
        recommendation: f.recommendation,
        open: f.status !== 'CLOSED',
    }));
}

export async function loadPriorTests(prisma: PrismaService, controlId: string, excludeTestId: string) {
    const rows = await prisma.controlTest.findMany({
        where: { controlId, id: { not: excludeTestId }, status: { in: ['TAMAMLANDI', 'ONAYLANDI'] } },
        orderBy: { plannedDate: 'desc' },
        take: 5,
        select: {
            testNo: true,
            plannedDate: true,
            findingStatus: true,
            resultText: true,
            findings: { select: { findingId: true, severity: true, description: true } },
        },
    });
    return rows.map((r) => ({
        testNo: r.testNo,
        plannedDate: r.plannedDate.toISOString().slice(0, 10),
        findingStatus: r.findingStatus,
        resultText: r.resultText,
        findings: r.findings.map((f) => ({
            findingId: f.findingId,
            severity: f.severity,
            description: f.description.slice(0, 400),
        })),
    }));
}
