import {
  Controller,
  Post,
  Get,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { extname, join, relative } from 'path';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { randomBytes } from 'crypto';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Roles } from '../../common/decorators';
import { PrismaService } from '../../prisma';

// Ürün kararı: yalnız PDF, DOCX, XLSX, PNG ve JPEG. Uzantı ile bildirilen MIME
// birbiriyle eşleşmelidir; genel application/octet-stream kabul edilmez.
const ALLOWED_FILE_TYPES: Readonly<Record<string, ReadonlySet<string>>> = {
  '.pdf': new Set(['application/pdf']),
  '.docx': new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  '.xlsx': new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  '.png': new Set(['image/png']),
  '.jpg': new Set(['image/jpeg']),
  '.jpeg': new Set(['image/jpeg']),
};
const MAX_SIZE = 10 * 1024 * 1024;
export const UPLOAD_ROOT = join(process.cwd(), 'uploads');

function monthDir(): string {
  const now = new Date();
  const dir = join(
    UPLOAD_ROOT,
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, '0'),
  );
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

@ApiTags('Uploads')
@ApiBearerAuth('JWT-Auth')
@Controller('uploads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UploadsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR', 'AUDITEE')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, monthDir()),
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `${randomBytes(16).toString('hex')}${ext}`);
        },
      }),
      limits: { fileSize: MAX_SIZE },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        const allowedMimes = ALLOWED_FILE_TYPES[ext];
        if (!allowedMimes) {
          return cb(
            new BadRequestException(
              `İzin verilmeyen dosya türü: ${ext || 'bilinmiyor'}`,
            ),
            false,
          );
        }
        if (!allowedMimes.has(file.mimetype)) {
          return cb(
            new BadRequestException(
              `Dosya uzantısı ile içerik türü eşleşmiyor: ${ext} / ${file.mimetype}`,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File, @CurrentUser('id') userId: string) {
    if (!file) throw new BadRequestException('Dosya bulunamadı');
    if (file.size === 0) {
      if (file.path && existsSync(file.path)) unlinkSync(file.path);
      throw new BadRequestException('Boş dosya yüklenemez');
    }
    // fileName: YYYY/MM/<hex>.ext (UPLOAD_ROOT'a göre göreli yol)
    const now = new Date();
    const relPath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${file.filename}`;
    const meta = {
      fileName: relPath,
      originalName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      mimeType: file.mimetype,
      sizeBytes: file.size,
    };
    const ticket = await this.prisma.uploadTicket.create({ data: { ...meta, uploadedById: userId, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'UPLOAD',
          entityType: 'UploadTicket',
          entityId: ticket.id,
          newValue: meta,
        },
      });
    } catch {
      // Denetim izi hatası dosya yükleme akışını kesmemelidir.
    }
    return { uploadId: ticket.id, ...meta };
  }

  @Get('download')
  downloadFile(
    @Query('file') file: string,
    @Query('name') name: string,
    @Res() res: Response,
  ) {
    throw new BadRequestException('Dosyaya kayıt kimliği üzerinden erişilmelidir.');
  }

  @Get('attachments/:kind/:id')
  async readAttachment(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Res() res: Response,
  ) {
    const elevated = ['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR'].includes(role);
    let attachment: any;
    let allowed = elevated;
    if (kind === 'control-test') {
      attachment = await this.prisma.controlTestAttachment.findUnique({ where: { id }, include: { controlTest: true } });
      allowed ||= !!attachment && (attachment.uploadedBy === userId || attachment.controlTest.assigneeId === userId || attachment.controlTest.secondControllerId === userId);
    } else if (kind === 'finding') {
      attachment = await this.prisma.findingAttachment.findUnique({ where: { id }, include: { finding: { include: { actions: { select: { ownerId: true } } } } } });
      allowed ||= !!attachment && (attachment.uploadedBy === userId || attachment.finding.assigneeId === userId || attachment.finding.actions.some((a: any) => a.ownerId === userId));
    } else if (kind === 'action') {
      attachment = await this.prisma.actionAttachment.findUnique({ where: { id }, include: { action: true } });
      allowed ||= !!attachment && (attachment.uploadedBy === userId || attachment.action.ownerId === userId);
    } else if (kind === 'follow-up') {
      attachment = await this.prisma.followUpAttachment.findUnique({ where: { id }, include: { followUp: { include: { action: true } } } });
      allowed ||= !!attachment && (attachment.uploadedBy === userId || attachment.followUp.evaluatorId === userId || attachment.followUp.secondControllerId === userId || attachment.followUp.action?.ownerId === userId);
    } else {
      throw new BadRequestException('Geçersiz kanıt türü');
    }
    if (!attachment) throw new NotFoundException('Kanıt bulunamadı');
    if (!allowed) throw new ForbiddenException('Bu kanıta erişim yetkiniz yok');
    const file = attachment.fileName;
    if (!file || file.includes('..') || file.startsWith('/')) throw new BadRequestException('Geçersiz dosya yolu');
    const abs = join(UPLOAD_ROOT, file);
    const rel = relative(UPLOAD_ROOT, abs);
    if (rel.startsWith('..') || rel === '' || !existsSync(abs)) throw new NotFoundException('Dosya bulunamadı');
    const requestedName = String(attachment.displayName || attachment.originalName || 'dosya').replace(/[\r\n"]/g, '_');
    const originalExt = extname(String(attachment.originalName || '')).toLowerCase();
    const safeName = originalExt && extname(requestedName).toLowerCase() !== originalExt
      ? `${requestedName}${originalExt}`
      : requestedName;
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `${download === 'true' ? 'attachment' : 'inline'}; filename="${safeName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(abs);
  }
}
