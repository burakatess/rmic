import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
    resetDatabase, seedRoles, createTestUser, createTestDirectorate,
    createTestControl, createTestControlTest,
} from './helpers/fixtures';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
    }));
    app.enableCors({ origin: 'http://127.0.0.1:3100', credentials: true });
    app.setGlobalPrefix('api');

    const prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    const roles = await seedRoles(prisma);
    const admin = await createTestUser(prisma, roles['SYSTEM_ADMIN'], {
        email: 'playwright-admin@e2e.local', firstName: 'Playwright', lastName: 'Admin',
    });
    const auditor = await createTestUser(prisma, roles['AUDITOR'], {
        email: 'playwright-auditor@e2e.local', firstName: 'Playwright', lastName: 'Denetçi',
    });
    const directorate = await createTestDirectorate(prisma, 'Playwright Test Direktörlüğü');
    const control = await createTestControl(prisma, { ownerId: admin.id, directorateId: directorate.id });
    const nonItControl = await createTestControl(prisma, { ownerId: admin.id, directorateId: directorate.id });
    await prisma.control.update({
        where: { id: nonItControl.id },
        data: { name: 'E2E BT Dışı Kontrol', type: 'BT_DISI' },
    });
    await prisma.controlYearScope.createMany({
        data: [
            {
                controlId: control.id,
                year: 2026,
                code: `2026.${control.controlId}`,
                frequency: 'MONTHLY',
                selectedMonths: [],
                addedById: admin.id,
                controlVersion: control.version,
                snapshotName: control.name,
                snapshotDescription: control.description,
            },
            {
                controlId: nonItControl.id,
                year: 2026,
                code: `2026.${nonItControl.controlId}`,
                frequency: 'MONTHLY',
                selectedMonths: [],
                addedById: admin.id,
                controlVersion: nonItControl.version,
                snapshotName: 'E2E BT Dışı Kontrol',
                snapshotDescription: nonItControl.description,
            },
        ],
    });
    const annualDraft = await prisma.annualPlanDraft.create({
        data: { year: 2026, revision: 1, status: 'OPEN', updatedById: admin.id },
    });
    await prisma.annualPlanDraftItem.create({
        data: {
            draftId: annualDraft.id,
            controlId: nonItControl.id,
            inScope: true,
            frequency: 'QUARTERLY',
            referenceMonth: 2,
            selectedMonths: [],
            reason: 'Playwright kaydedilmiş taslak değişikliği',
        },
    });
    const controlTest = await createTestControlTest(prisma, { controlId: control.id, assigneeId: admin.id });
    const draftControlTest = await createTestControlTest(prisma, {
        controlId: control.id,
        assigneeId: admin.id,
        secondControllerId: auditor.id,
        directorateId: directorate.id,
        status: 'DEVAM_EDIYOR',
    });
    await prisma.controlTest.update({
        where: { id: draftControlTest.id },
        data: {
            testNo: '2026.KBT-PWDRAFT',
            resultText: 'Kaydedilmiş Playwright taslak değerlendirmesi',
            evidenceSummary: 'Taslak kanıt özeti yeniden açıldığında korunur.',
            contentVersion: 3,
        },
    });
    await prisma.controlTestAttachment.create({
        data: {
            controlTestId: draftControlTest.id,
            fileName: 'pw-draft-evidence.pdf',
            originalName: 'taslak-kanit.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 2048,
            uploadedBy: admin.id,
        },
    });
    const approvedAt = new Date('2026-09-24T09:00:00.000Z');

    await prisma.controlTest.update({
        where: { id: controlTest.id },
        data: {
            testNo: '2026.KBT-PWLOCK',
            status: 'ONAYLANDI',
            findingStatus: 'BULGUSU_VAR',
            completedAt: approvedAt,
            approvedAt,
            approvedById: admin.id,
        },
    });
    await prisma.controlTestAttachment.create({
        data: {
            controlTestId: controlTest.id,
            fileName: 'pw-approved-evidence.pdf',
            originalName: 'onayli-kanit.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 4096,
            uploadedBy: admin.id,
        },
    });
    await prisma.control.update({
        where: { id: control.id },
        data: {
            effectivenessStatus: 'INEFFECTIVE',
            lastTestResult: 'INEFFECTIVE',
            lastTestDate: approvedAt,
        },
    });

    const finding = await prisma.finding.create({
        data: {
            findingId: '2026.BT.PW01',
            findingType: 'BT',
            description: 'Playwright tarihçe görünümü için bulgu',
            summary: 'Playwright tarihçe bulgusu',
            impact: 'Kontrol etkin değil olarak değerlendirilmiştir.',
            severity: 'HIGH',
            status: 'IN_PROGRESS',
            controlId: control.id,
            controlTestId: controlTest.id,
            directorateId: directorate.id,
        },
    });
    await prisma.finding.create({
        data: {
            findingId: '2026.BT.PW02',
            findingType: 'BT',
            description: 'Aynı kontrol testindeki ikinci Playwright bulgusu',
            summary: 'Playwright ikinci bulgu',
            impact: 'Tek testte birden fazla bulgu görünümünü doğrular.',
            severity: 'CRITICAL',
            status: 'IN_PROGRESS',
            controlId: control.id,
            controlTestId: controlTest.id,
            directorateId: directorate.id,
        },
    });
    await prisma.findingStatusHistory.create({
        data: {
            findingId: finding.id,
            operation: 'FINDING_UPDATED',
            explanation: 'Playwright geçmiş kaydı ekranda korunuyor.',
            evaluator: 'Playwright Admin',
            userId: admin.id,
        },
    });

    const riskCategory = await prisma.riskCategory.create({
        data: { name: 'Playwright Risk Kategorisi', color: '#2563eb' },
    });
    const risk = await prisma.risk.create({
        data: {
            riskId: 'R-PW-001',
            name: 'Playwright ilişkili risk',
            description: 'Kontrol ve risk detay ekranlarındaki çift yönlü ilişki testi.',
            ownerId: admin.id,
            categoryId: riskCategory.id,
            inherentProbability: 3,
            inherentImpact: 4,
            inherentRiskScore: 12,
        },
    });
    await prisma.controlRiskMapping.create({
        data: { controlId: control.id, riskId: risk.id, mappingType: 'PRIMARY' },
    });
    await prisma.finding.update({
        where: { id: finding.id },
        data: { riskId: risk.id, linkedRisks: { connect: { id: risk.id } } },
    });

    const overdueAction = await prisma.action.create({
        data: {
            actionId: 'A-PW-001',
            description: 'Playwright gecikmiş aksiyon',
            findingId: finding.id,
            controlId: control.id,
            ownerId: admin.id,
            directorateId: directorate.id,
            status: 'DEVAM_EDIYOR',
            dueDate: new Date('2026-09-01T09:00:00.000Z'),
        },
    });
    await prisma.action.create({
        data: {
            actionId: 'A-PW-002',
            description: 'Playwright diğer kullanıcı aksiyonu',
            findingId: finding.id,
            controlId: control.id,
            ownerId: auditor.id,
            directorateId: directorate.id,
            status: 'BEKLIYOR',
            dueDate: new Date('2026-12-15T09:00:00.000Z'),
        },
    });
    const deferredFollowUp = await prisma.findingFollowUp.create({
        data: {
            followUpId: '2026.09.BT.PW01',
            findingId: finding.id,
            actionId: overdueAction.id,
            status: 'BEKLIYOR',
            plannedDate: new Date('2026-09-01T09:00:00.000Z'),
            directorateId: directorate.id,
        },
    });
    await prisma.findingFollowUp.create({
        data: {
            followUpId: '2026.10.BT.PW02',
            findingId: finding.id,
            actionId: overdueAction.id,
            status: 'DEVAM_EDIYOR',
            plannedDate: new Date('2026-10-15T09:00:00.000Z'),
            testDate: new Date('2026-10-15T09:00:00.000Z'),
            newFollowUpDate: new Date('2026-10-15T09:00:00.000Z'),
            resolutionOutcome: 'ERTELENDI',
            result: 'YETERSIZ',
            explanation: 'Eksik çalışma nedeniyle ileri tarihe ertelendi.',
            birimCevabi: 'Birim düzeltme çalışmalarını sürdürüyor.',
            currentStatusDetail: 'Kontrol iyileştirmesi devam ediyor.',
            internalControlAssessment: 'Kanıtların yeni tarihte tekrar incelenmesi gerekiyor.',
            directorateId: directorate.id,
            evaluatorId: admin.id,
        },
    });
    await prisma.findingStatusHistory.create({
        data: {
            findingId: finding.id,
            followUpId: deferredFollowUp.id,
            operation: 'FOLLOWUP_SECOND_CONTROLLER_CHANGED',
            explanation: 'İkinci kontrolcü gerekçeli olarak değiştirildi.',
            evaluator: 'Playwright Admin',
            userId: admin.id,
        },
    });

    await app.listen(3099, '127.0.0.1');
}

void bootstrap();
