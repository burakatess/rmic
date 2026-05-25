import { Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma';

@ApiTags('Tests Generation')
@Controller('tests')
export class TestsController {
    constructor(private prisma: PrismaService) {}

    @Post('generate')
    async generateTests() {
        try {
            const controls = await this.prisma.control.findMany({
                where: { status: 'ACTIVE' },
            });

            let generatedCount = 0;
            const now = new Date();

            for (const control of controls) {
                let shouldGenerate = false;
                let dueDate = new Date();

                if (control.frequency === 'DAILY') {
                    shouldGenerate = true;
                    dueDate.setDate(now.getDate() + 1);
                } else if (control.frequency === 'WEEKLY') {
                    shouldGenerate = true;
                    dueDate.setDate(now.getDate() + 7);
                } else if (control.frequency === 'MONTHLY') {
                    shouldGenerate = true;
                    dueDate.setMonth(now.getMonth() + 1);
                    dueDate.setDate(1);
                } else if (['QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'AD_HOC'].includes(control.frequency)) {
                    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
                    const currentMonthName = monthNames[now.getMonth()];
                    
                    // selectedMonths in Prisma model is String[].
                    if (control.selectedMonths && control.selectedMonths.includes(currentMonthName)) {
                        shouldGenerate = true;
                        dueDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                    }
                }

                if (shouldGenerate) {
                    const existing = await this.prisma.testRecord.findFirst({
                        where: {
                            controlId: control.id,
                            status: { in: ['PENDING', 'IN_PROGRESS'] }
                        }
                    });

                    if (!existing) {
                        await this.prisma.testRecord.create({
                            data: {
                                controlId: control.id,
                                dueDate: dueDate,
                                status: 'PENDING',
                                assigneeId: control.testPerformerId || control.ownerId,
                            }
                        });
                        generatedCount++;
                    }
                }
            }

            return {
                success: true,
                message: `${generatedCount} yeni test kaydı başarıyla oluşturuldu.`,
                generatedCount
            };
        } catch (error) {
            console.error('Test generation error:', error);
            throw error;
        }
    }
}
