import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma';

@Injectable()
export class ControlsService {
    constructor(private prisma: PrismaService) { }

    // ─── ID Generators ────────────────────────────────────────────────────────

    private async generateControlId(): Promise<string> {
        const year = new Date().getFullYear();
        const prefix = `K-${year}-`;
        const last = await this.prisma.control.findFirst({
            where: { controlId: { startsWith: prefix } },
            orderBy: { controlId: 'desc' },
        });
        let next = 1;
        if (last) {
            const parts = last.controlId.split('-');
            const n = parseInt(parts[2], 10);
            if (!isNaN(n)) next = n + 1;
        }
        return `${prefix}${next.toString().padStart(4, '0')}`;
    }

    async generateTestNo(controlType: string, plannedDate: Date): Promise<string> {
        const year = plannedDate.getFullYear();
        const prefix = `TST-${year}-`;
        const last = await this.prisma.controlTest.findFirst({
            where: { testNo: { startsWith: prefix } },
            orderBy: { testNo: 'desc' },
        });
        let next = 1;
        if (last) {
            const parts = last.testNo.split('-');
            const n = parseInt(parts[2], 10);
            if (!isNaN(n)) next = n + 1;
        }
        return `${prefix}${next.toString().padStart(4, '0')}`;
    }

    // ─── Controls CRUD ────────────────────────────────────────────────────────

    async findAll(query: any) {
        const { search, type, nature, ownerId, status, directorateId, sortBy, sortOrder } = query;
        const page = parseInt(query.page, 10) || 1;
        const limit = parseInt(query.limit, 10) || 20;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { controlId: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (type) where.type = type;
        if (nature) where.nature = nature;
        if (ownerId) where.ownerId = ownerId;
        if (status) where.status = status;
        if (directorateId) where.directorateId = directorateId;

        const [controls, total] = await Promise.all([
            this.prisma.control.findMany({
                where,
                include: {
                    owner: { select: { id: true, firstName: true, lastName: true, email: true, department: true } },
                    directorateRel: { select: { id: true, name: true, code: true } },
                    risks: { include: { risk: { select: { id: true, riskId: true, name: true } } } },
                    _count: { select: { risks: true, tests: true, findings: true } },
                },
                skip,
                take: limit,
                orderBy: { [sortBy || 'createdAt']: sortOrder || 'desc' },
            }),
            this.prisma.control.count({ where }),
        ]);

        return { data: controls, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    async findOne(id: string) {
        const control = await this.prisma.control.findUnique({
            where: { id },
            include: {
                owner: { select: { id: true, firstName: true, lastName: true, email: true } },
                testPerformer: { select: { id: true, firstName: true, lastName: true, email: true } },
                reviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
                directorateRel: { select: { id: true, name: true, code: true, gmy: true } },
                risks: { include: { risk: true } },
                tests: {
                    orderBy: { plannedDate: 'asc' },
                    include: {
                        findings: { select: { id: true, findingId: true, severity: true, resolutionStatus: true } },
                    },
                },
                findings: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                    include: {
                        actions: { include: { owner: { select: { firstName: true, lastName: true } } } },
                    },
                },
                regulations: { include: { article: { include: { regulation: true } } } },
            },
        });
        if (!control) throw new NotFoundException(`Control with ID ${id} not found`);
        return control;
    }

    async create(data: any, userId: string) {
        const { months, status, isActive, ...rest } = data;
        let controlStatus: 'ACTIVE' | 'PASSIVE' = 'ACTIVE';
        if (isActive === false || status === 'PASSIVE') controlStatus = 'PASSIVE';

        // directorateId / ownerId FK doğrulaması — Prisma FK 500 yerine okunur 400
        if (data.directorateId) {
            const dirExists = await this.prisma.directorate.findUnique({
                where: { id: data.directorateId }, select: { id: true },
            });
            if (!dirExists) throw new BadRequestException('Geçersiz direktörlük: seçilen direktörlük bulunamadı');
        }
        if (data.ownerId) {
            const ownerExists = await this.prisma.user.findUnique({ where: { id: data.ownerId }, select: { id: true } });
            if (!ownerExists) throw new BadRequestException('Geçersiz kullanıcı: kontrol sahibi bulunamadı');
        }

        const controlId = data.controlId || await this.generateControlId();

        const control = await this.prisma.control.create({
            data: {
                ...rest,
                controlId,
                name: data.name || controlId,
                description: data.description || '',
                type: data.type || 'BT',
                nature: data.nature || 'PREVENTIVE',
                automation: data.automation || 'MANUAL',
                frequency: data.frequency || 'MONTHLY',
                selectedMonths: months || [],
                status: controlStatus,
                ownerId: data.ownerId || userId,
                directorateId: data.directorateId || null,
            },
            include: {
                owner: { select: { id: true, firstName: true, lastName: true, email: true } },
                directorateRel: { select: { id: true, name: true, code: true } },
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'Control', entityId: control.id, newValue: control },
        });

        if (control.status === 'ACTIVE') {
            await this.generateTestsForControl(control.id);
        }

        return control;
    }

    async update(id: string, data: any, userId: string) {
        const existing = await this.findOne(id);

        let controlStatus: 'ACTIVE' | 'PASSIVE' | undefined;
        if (data.isActive !== undefined) {
            controlStatus = data.isActive ? 'ACTIVE' : 'PASSIVE';
        } else if (data.status !== undefined) {
            controlStatus = data.status === 'ACTIVE' ? 'ACTIVE' : 'PASSIVE';
        }

        // directorateId / ownerId doğrulaması: FK 500 yerine 400
        if (data.directorateId) {
            const dirExists = await this.prisma.directorate.findUnique({
                where: { id: data.directorateId },
                select: { id: true },
            });
            if (!dirExists) {
                throw new BadRequestException('Geçersiz direktörlük: seçilen direktörlük bulunamadı');
            }
        }
        if (data.ownerId) {
            const ownerExists = await this.prisma.user.findUnique({ where: { id: data.ownerId }, select: { id: true } });
            if (!ownerExists) throw new BadRequestException('Geçersiz kullanıcı: kontrol sahibi bulunamadı');
        }

        // Whitelist: yalnızca Control şemasında olan alanlar
        const updateData: any = {};
        const ALLOWED = ['controlId', 'name', 'description', 'type', 'nature', 'automation', 'frequency',
            'controlPeriod', 'controlDate', 'mehaz', 'testSteps', 'notes', 'gmy'];
        for (const key of ALLOWED) {
            if (data[key] !== undefined) updateData[key] = data[key];
        }

        // FK alanları: yalnızca dolu (truthy) ise yaz; boş/null gelirse mevcut değeri koru
        if (data.ownerId) updateData.ownerId = data.ownerId;
        if (data.testPerformerId) updateData.testPerformerId = data.testPerformerId;
        else if (data.testPerformerId === null) updateData.testPerformerId = null;
        if (data.secondControllerId) updateData.secondControllerId = data.secondControllerId;
        else if (data.secondControllerId === null) updateData.secondControllerId = null;
        if (data.contactPersonId) updateData.contactPersonId = data.contactPersonId;
        else if (data.contactPersonId === null) updateData.contactPersonId = null;
        if (data.reviewerId) updateData.reviewerId = data.reviewerId;
        else if (data.reviewerId === null) updateData.reviewerId = null;

        // Özel alanlar
        if (data.months !== undefined) updateData.selectedMonths = data.months;
        if (data.selectedMonths !== undefined) updateData.selectedMonths = data.selectedMonths;
        if (controlStatus !== undefined) updateData.status = controlStatus;
        if (data.directorateId !== undefined) updateData.directorateId = data.directorateId || null;

        const control = await this.prisma.control.update({
            where: { id },
            data: updateData,
            include: {
                owner: { select: { id: true, firstName: true, lastName: true, email: true } },
                directorateRel: { select: { id: true, name: true, code: true } },
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'UPDATE', entityType: 'Control', entityId: id, oldValue: existing, newValue: control },
        });

        if (control.status === 'ACTIVE') {
            await this.generateTestsForControl(control.id);
        }

        return control;
    }

    async activate(id: string, userId: string) {
        const control = await this.prisma.control.update({
            where: { id },
            data: { status: 'ACTIVE' },
        });
        await this.prisma.auditLog.create({
            data: { userId, action: 'ACTIVATE', entityType: 'Control', entityId: id },
        });
        await this.generateTestsForControl(id);
        return control;
    }

    async passivate(id: string, userId: string) {
        const control = await this.prisma.control.update({
            where: { id },
            data: { status: 'PASSIVE' },
        });
        await this.prisma.auditLog.create({
            data: { userId, action: 'PASSIVATE', entityType: 'Control', entityId: id },
        });
        return control;
    }

    async mapRisk(controlId: string, riskId: string, mappingType = 'PRIMARY') {
        return this.prisma.controlRiskMapping.upsert({
            where: { controlId_riskId: { controlId, riskId } },
            update: { mappingType },
            create: { controlId, riskId, mappingType },
            include: { control: true, risk: true },
        });
    }

    async unmapRisk(controlId: string, riskId: string) {
        return this.prisma.controlRiskMapping.deleteMany({ where: { controlId, riskId } });
    }

    async delete(id: string, userId: string) {
        const control = await this.findOne(id);
        await this.prisma.auditLog.create({
            data: { userId, action: 'DELETE', entityType: 'Control', entityId: id, oldValue: control },
        });
        await this.prisma.controlTest.deleteMany({ where: { controlId: id } });
        await this.prisma.controlRiskMapping.deleteMany({ where: { controlId: id } });
        await this.prisma.control.delete({ where: { id } });
        return { message: 'Control deleted successfully' };
    }

    async getRelations(id: string) {
        const control = await this.prisma.control.findUnique({
            where: { id },
            include: { owner: { select: { id: true, firstName: true, lastName: true } } },
        });
        if (!control) throw new NotFoundException(`Control ${id} not found`);

        const riskMappings = await this.prisma.controlRiskMapping.findMany({
            where: { controlId: id },
            include: { risk: { select: { id: true, riskId: true, name: true, status: true, residualRiskScore: true } } },
        });

        const findings = await this.prisma.finding.findMany({
            where: { controlId: id },
            select: { id: true, findingId: true, description: true, status: true, severity: true },
        });

        const actions = await this.prisma.action.findMany({
            where: { findingId: { in: findings.map(f => f.id) } },
            select: { id: true, actionId: true, description: true, status: true, dueDate: true },
        });

        return {
            control: { id: control.id, controlId: control.controlId, name: control.name, effectivenessStatus: control.effectivenessStatus, owner: control.owner },
            risks: riskMappings.map(m => m.risk),
            findings,
            actions,
        };
    }

    // ─── ControlTest CRUD ─────────────────────────────────────────────────────

    async getAllTests(query: any) {
        const { status, controlId, directorateId, assigneeId, findingStatus, sortBy, sortOrder } = query;
        const page = parseInt(query.page, 10) || 1;
        const limit = parseInt(query.limit, 10) || 50;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (status) where.status = status;
        if (controlId) where.controlId = controlId;
        if (directorateId) where.directorateId = directorateId;
        if (assigneeId) where.assigneeId = assigneeId;
        if (findingStatus) where.findingStatus = findingStatus;

        const [tests, total] = await Promise.all([
            this.prisma.controlTest.findMany({
                where,
                include: {
                    control: { select: { id: true, controlId: true, name: true, type: true, frequency: true, gmy: true } },
                    directorate: { select: { id: true, name: true, code: true } },
                    findings: { select: { id: true, findingId: true, severity: true, resolutionStatus: true } },
                    attachments: true,
                },
                skip,
                take: limit,
                orderBy: { [sortBy || 'plannedDate']: sortOrder || 'asc' },
            }),
            this.prisma.controlTest.count({ where }),
        ]);

        return { data: tests, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    async getTests(controlId: string) {
        return this.prisma.controlTest.findMany({
            where: { controlId },
            include: {
                findings: { select: { id: true, findingId: true, severity: true, resolutionStatus: true } },
                directorate: { select: { id: true, name: true } },
                attachments: true,
            },
            orderBy: { plannedDate: 'desc' },
        });
    }

    async createTest(controlId: string, data: any, userId: string) {
        const control = await this.prisma.control.findUnique({ where: { id: controlId }, select: { type: true } });
        if (!control) throw new NotFoundException(`Control ${controlId} not found`);
        const plannedDate = data.plannedDate ? new Date(data.plannedDate) : new Date();
        const testNo = await this.generateTestNo(control.type, plannedDate);
        const test = await this.prisma.controlTest.create({
            data: {
                testNo,
                controlId,
                plannedDate,
                summary: data.summary || null,
                description: data.description || null,
                assigneeId: data.assigneeId || null,
                secondControllerId: data.secondControllerId || null,
                directorateId: data.directorateId || null,
                sprint: data.sprint || null,
                isAutoGenerated: false,
                status: 'BEKLIYOR',
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'ControlTest', entityId: test.id, newValue: test },
        });

        return test;
    }

    // ─── ControlTest Kanıt Ekleri ─────────────────────────────────────────────
    async addControlTestAttachment(
        testId: string,
        meta: { fileName: string; originalName: string; mimeType: string; sizeBytes: number },
        userId: string,
    ) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId }, select: { id: true } });
        if (!test) throw new NotFoundException(`Test ${testId} not found`);

        const att = await this.prisma.controlTestAttachment.create({
            data: {
                controlTestId: testId,
                fileName: meta.fileName,
                originalName: meta.originalName,
                mimeType: meta.mimeType,
                sizeBytes: meta.sizeBytes,
                uploadedBy: userId,
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'FILE_UPLOADED', entityType: 'ControlTestAttachment', entityId: att.id, newValue: { testId, originalName: meta.originalName } },
        });

        return att;
    }

    async removeControlTestAttachment(testId: string, attachmentId: string, userId: string) {
        const att = await this.prisma.controlTestAttachment.findFirst({
            where: { id: attachmentId, controlTestId: testId },
        });
        if (!att) throw new NotFoundException('Ek bulunamadı');

        await this.prisma.controlTestAttachment.delete({ where: { id: attachmentId } });
        await this.prisma.auditLog.create({
            data: { userId, action: 'FILE_DELETED', entityType: 'ControlTestAttachment', entityId: attachmentId },
        });
        return { success: true };
    }

    async startTest(testId: string, userId: string) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId } });
        if (!test) throw new NotFoundException(`Test ${testId} not found`);
        if (test.status !== 'BEKLIYOR') throw new BadRequestException('Test başlatmak için BEKLIYOR statüsünde olmalı.');

        const updated = await this.prisma.controlTest.update({
            where: { id: testId },
            data: { status: 'DEVAM_EDIYOR' },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'START_TEST', entityType: 'ControlTest', entityId: testId },
        });

        return updated;
    }

    async completeTest(testId: string, data: any, userId: string) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId } });
        if (!test) throw new NotFoundException(`Test ${testId} not found`);
        // İş kuralı: test yeniden başlatılmadan (DEVAM_EDIYOR) veya geri gönderilmiş
        // (GERI_GONDERILDI) haldeyken tamamlanıp onaya gönderilebilir.
        if (!['DEVAM_EDIYOR', 'GERI_GONDERILDI'].includes(test.status)) {
            throw new BadRequestException(`Test tamamlanmak için DEVAM_EDIYOR veya GERI_GONDERILDI statüsünde olmalı. Mevcut: ${test.status}`);
        }

        // ── Madde 6: Açık bulguya referans ile ilerletme ────────────────────────
        if (data.referencedFindingId) {
            const ref = await this.prisma.finding.findUnique({ where: { id: data.referencedFindingId } });
            if (!ref) throw new BadRequestException('Referans verilen bulgu bulunamadı.');
            // Aynı kontrol zinciriyle ilişkili olmalı: doğrudan bu kontrole bağlı olsun
            // ya da bu kontrolün başka bir testine bağlı olsun.
            const relatedViaControl = ref.controlId === test.controlId;
            const relatedViaTest = ref.controlTestId
                ? (await this.prisma.controlTest.findUnique({ where: { id: ref.controlTestId }, select: { controlId: true } }))?.controlId === test.controlId
                : false;
            if (!relatedViaControl && !relatedViaTest) {
                throw new BadRequestException('Referans verilen bulgu bu kontrolle ilişkili değil.');
            }
            if (ref.status === 'CLOSED') {
                throw new BadRequestException('Kapalı bir bulguya referans verilemez.');
            }

            const updated = await this.prisma.controlTest.update({
                where: { id: testId },
                data: {
                    status: 'TAMAMLANDI',
                    completedAt: new Date(),
                    findingStatus: 'BULGUSU_VAR',
                    referencedFindingId: ref.id,
                    referenceReason: data.referenceReason || null,
                    resultText: data.resultText || `Devam eden açık bulgu (${ref.findingId}) referans alınarak ilerletildi.`,
                },
            });

            await this.prisma.auditLog.create({
                data: { userId, action: 'REFERENCE_FINDING', entityType: 'ControlTest', entityId: testId, newValue: { referencedFindingId: ref.id, findingId: ref.findingId } },
            });

            return updated;
        }

        // İş kuralı: BULGUSU_VAR seçildiyse en az 1 bulgu kaydı olmalı
        const findingCount = await this.prisma.finding.count({ where: { controlTestId: testId } });
        if (data.findingStatus === 'BULGUSU_VAR' && findingCount === 0) {
            throw new BadRequestException(
                'BULGUSU_VAR seçilen test için en az bir bulgu kaydı oluşturulmalıdır.',
            );
        }
        if (data.findingStatus === 'BULGUSU_YOK' && findingCount > 0) {
            throw new BadRequestException(
                'Bu teste bağlı bulgu kayıtları var. Sonuç BULGUSU_YOK olamaz.',
            );
        }

        // Test tamamlandığında BULGUSU_VAR/YOK farketmeksizin doğrudan final onaylı
        // sayılmaz — TAMAMLANDI = 2. kontrolcü onayına gönderildi.
        const updated = await this.prisma.controlTest.update({
            where: { id: testId },
            data: {
                status: 'TAMAMLANDI',
                completedAt: new Date(),
                findingStatus: data.findingStatus || 'BULGUSU_YOK',
                resultText: data.resultText || null,
                evidenceSummary: data.evidenceSummary || null,
                evidenceUrls: data.evidenceUrls || [],
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'COMPLETE_TEST', entityType: 'ControlTest', entityId: testId, newValue: updated },
        });

        return updated;
    }

    async approveTest(testId: string, userId: string) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId } });
        if (!test) throw new NotFoundException(`Test ${testId} not found`);
        if (test.status !== 'TAMAMLANDI') throw new BadRequestException('Onaylamak için test TAMAMLANDI statüsünde olmalı.');

        const approver = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: { select: { name: true } } } });
        const isAdmin = approver?.role?.name === 'SYSTEM_ADMIN';

        // İş kuralı: testi yapan kendi ikinci kontrol onayını veremez — maker/checker
        // ayrımı SYSTEM_ADMIN için de istisnasız uygulanır (kullanıcı talebinde "eğer iş
        // kuralı böyle değilse açıkça raporla" denmişti; en güvenli/tutarlı yorum budur).
        if (test.assigneeId === userId) {
            throw new BadRequestException('Testi yapan kullanıcı kendi ikinci kontrol onayını veremez.');
        }
        // İkinci kontrolcü atanmışsa yalnızca o kişi (veya admin) onaylayabilir.
        if (test.secondControllerId && test.secondControllerId !== userId && !isAdmin) {
            throw new BadRequestException('Bu test size atanmış bir onay değil.');
        }

        const updated = await this.prisma.controlTest.update({
            where: { id: testId },
            data: { status: 'ONAYLANDI', approvedAt: new Date(), approvedById: userId },
        });

        // Kontrol etkinlik durumunu güncelle
        const effectivenessMap: Record<string, 'EFFECTIVE' | 'INEFFECTIVE' | 'PARTIALLY_EFFECTIVE'> = {
            BULGUSU_YOK: 'EFFECTIVE',
            BULGUSU_VAR: 'INEFFECTIVE',
        };
        const effectiveness = test.findingStatus ? (effectivenessMap[test.findingStatus] || 'NOT_TESTED') : 'NOT_TESTED';

        await this.prisma.control.update({
            where: { id: test.controlId },
            data: {
                lastTestDate: test.completedAt || new Date(),
                lastTestResult: effectiveness as any,
                effectivenessStatus: effectiveness as any,
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'APPROVE_TEST', entityType: 'ControlTest', entityId: testId },
        });

        return updated;
    }

    async returnTest(testId: string, reason: string, userId: string) {
        if (!reason || !reason.trim()) {
            throw new BadRequestException('Geri gönderme gerekçesi zorunludur.');
        }
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId } });
        if (!test) throw new NotFoundException(`Test ${testId} not found`);
        if (test.status !== 'TAMAMLANDI') throw new BadRequestException('Geri göndermek için test TAMAMLANDI (onay bekliyor) statüsünde olmalı.');

        const approver = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: { select: { name: true } } } });
        const isAdmin = approver?.role?.name === 'SYSTEM_ADMIN';
        if (test.secondControllerId && test.secondControllerId !== userId && !isAdmin) {
            throw new BadRequestException('Bu test size atanmış bir onay değil.');
        }

        const updated = await this.prisma.controlTest.update({
            where: { id: testId },
            data: {
                status: 'GERI_GONDERILDI',
                rejectionReason: reason,
                returnedById: userId,
                returnedAt: new Date(),
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'RETURN_TEST', entityType: 'ControlTest', entityId: testId, newValue: { reason } },
        });

        return updated;
    }

    /** Final (ONAYLANDI) bir testi iptal eder — yalnızca SYSTEM_ADMIN çağırabilir (RBAC controller'da). */
    async cancelFinalApproval(testId: string, reason: string, userId: string) {
        const test = await this.prisma.controlTest.findUnique({ where: { id: testId } });
        if (!test) throw new NotFoundException(`Test ${testId} not found`);
        if (test.status !== 'ONAYLANDI') {
            throw new BadRequestException('Yalnızca final onaylanmış (ONAYLANDI) testler iptal edilebilir.');
        }

        const updated = await this.prisma.controlTest.update({
            where: { id: testId },
            data: {
                status: 'IPTAL',
                cancelledAt: new Date(),
                cancelledById: userId,
                cancelReason: reason || null,
            },
        });

        await this.prisma.auditLog.create({
            data: { userId, action: 'CANCEL_FINAL_APPROVAL', entityType: 'ControlTest', entityId: testId, newValue: { reason } },
        });

        return updated;
    }

    // ─── Merkezi Onay Sayfası ──────────────────────────────────────────────────

    async getMyPendingApprovals(userId: string, query: any) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: { select: { name: true } } } });
        const isAdmin = user?.role?.name === 'SYSTEM_ADMIN';

        const where: any = {
            status: 'TAMAMLANDI',
            OR: [
                { secondControllerId: userId },
                ...(isAdmin ? [{ secondControllerId: null }] : []),
            ],
        };
        if (query.directorateId) where.directorateId = query.directorateId;
        if (query.dateFrom || query.dateTo) {
            where.completedAt = {};
            if (query.dateFrom) where.completedAt.gte = new Date(query.dateFrom);
            if (query.dateTo) where.completedAt.lte = new Date(query.dateTo);
        }

        const tests = await this.prisma.controlTest.findMany({
            where,
            include: {
                control: { select: { id: true, controlId: true, name: true, type: true } },
                directorate: { select: { id: true, name: true } },
                findings: { select: { id: true, findingId: true, severity: true } },
                attachments: true,
            },
            orderBy: { completedAt: 'asc' },
        });

        return {
            data: tests.map(t => ({ ...t, type: 'CONTROL_TEST' as const })),
        };
    }

    async getApprovalDetail(testId: string) {
        const test = await this.prisma.controlTest.findUnique({
            where: { id: testId },
            include: {
                control: { select: { id: true, controlId: true, name: true, type: true, gmy: true } },
                directorate: { select: { id: true, name: true, code: true } },
                findings: { select: { id: true, findingId: true, severity: true, resolutionStatus: true, summary: true } },
                referencedFinding: { select: { id: true, findingId: true, status: true, summary: true } },
                attachments: true,
            },
        });
        if (!test) throw new NotFoundException(`Test ${testId} not found`);

        const submittedBy = test.assigneeId
            ? await this.prisma.user.findUnique({ where: { id: test.assigneeId }, select: { id: true, firstName: true, lastName: true, email: true } })
            : null;

        return { ...test, type: 'CONTROL_TEST' as const, submittedBy, submittedAt: test.completedAt };
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    /** Ayın son iş gününü döner (Cmt→Cuma, Paz→Cuma) */
    private getLastBusinessDay(year: number, month: number): Date {
        const lastDay = new Date(year, month + 1, 0);
        const dow = lastDay.getDay();
        if (dow === 0) lastDay.setDate(lastDay.getDate() - 2);
        else if (dow === 6) lastDay.setDate(lastDay.getDate() - 1);
        return lastDay;
    }

    /** Yılın tüm Cuma tarihlerini döner */
    private getFridaysInYear(year: number): Date[] {
        const fridays: Date[] = [];
        const d = new Date(year, 0, 1);
        while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
        while (d.getFullYear() === year) {
            fridays.push(new Date(d));
            d.setDate(d.getDate() + 7);
        }
        return fridays;
    }

    private static readonly turkishMonthIndex: Record<string, number> = {
        'Ocak': 0, 'Şubat': 1, 'Mart': 2, 'Nisan': 3, 'Mayıs': 4, 'Haziran': 5,
        'Temmuz': 6, 'Ağustos': 7, 'Eylül': 8, 'Ekim': 9, 'Kasım': 10, 'Aralık': 11,
    };

    // ─── Test Auto-Generation (Frekansa göre yıllık testler) ─────────────────

    async generateTestsForControl(controlId: string) {
        const control = await this.prisma.control.findUnique({ where: { id: controlId } });
        if (!control || control.status !== 'ACTIVE') return { generated: 0 };

        // Mevcut otomatik test varsa atla
        const existing = await this.prisma.controlTest.count({
            where: { controlId, isAutoGenerated: true },
        });
        if (existing > 0) return { generated: 0, message: 'Auto-generated tests already exist' };

        const currentYear = new Date().getFullYear();
        const now = new Date();

        let plannedDates: Date[] = [];

        switch (control.frequency) {
            case 'DAILY':
                // Günlük kontroller için test kaydı üretilmez
                return { generated: 0, message: 'Daily controls do not generate test records' };

            case 'WEEKLY': {
                // Her Cuma tarihli kayıt — sadece gelecek Cumalar
                const allFridays = this.getFridaysInYear(currentYear);
                plannedDates = allFridays.filter(f => f >= now);
                break;
            }

            case 'MONTHLY': {
                // 12 kayıt — her ayın son iş günü
                for (let m = 0; m < 12; m++) {
                    plannedDates.push(this.getLastBusinessDay(currentYear, m));
                }
                break;
            }

            case 'QUARTERLY':
            case 'SEMI_ANNUAL':
            case 'ANNUAL':
            case 'AD_HOC': {
                // Seçili aylardaki son iş günleri
                const months = control.selectedMonths || [];
                for (const monthName of months) {
                    const mi = ControlsService.turkishMonthIndex[monthName];
                    if (mi === undefined) continue;
                    plannedDates.push(this.getLastBusinessDay(currentYear, mi));
                }
                break;
            }

            default: {
                // Bilinmeyen frekans — selectedMonths varsa kullan
                const months = control.selectedMonths || [];
                for (const monthName of months) {
                    const mi = ControlsService.turkishMonthIndex[monthName];
                    if (mi === undefined) continue;
                    plannedDates.push(this.getLastBusinessDay(currentYear, mi));
                }
                break;
            }
        }

        // Tarih sırasına göre sırala
        plannedDates.sort((a, b) => a.getTime() - b.getTime());

        let generated = 0;
        for (const plannedDate of plannedDates) {
            const testNo = await this.generateTestNo(control.type, plannedDate);
            await this.prisma.controlTest.create({
                data: {
                    testNo,
                    controlId,
                    plannedDate,
                    isAutoGenerated: true,
                    status: 'BEKLIYOR',
                    assigneeId: control.ownerId,
                    directorateId: control.directorateId,
                },
            });
            generated++;
        }

        return { generated };
    }
}
