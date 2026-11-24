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
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { extname, isAbsolute, join, relative, sep } from 'path';
import { existsSync, mkdirSync, realpathSync, unlinkSync } from 'fs';
import { randomBytes } from 'crypto';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Roles } from '../../common/decorators';
import { PrismaService } from '../../prisma';
import { AccessScopeService } from '../../common/services/access-scope.service';
import type { AccessActor } from '../../common/services/access-scope.service';

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

/**
 * Kayıttaki göreli dosya adını yükleme köküne göre doğrular ve köke göreli yolu döndürür.
 * `..`, mutlak yol ve kök dışına çıkan sembolik bağlantı reddedilir; dosya yoksa 404.
 * Hata mesajları iç dosya yolunu içermez.
 */
export function resolveUploadPath(fileName: unknown, root: string = UPLOAD_ROOT): string {
  const file = typeof fileName === 'string' ? fileName : '';
  if (!file || file.includes('..') || isAbsolute(file) || file.startsWith('/') || file.includes('\0')) {
    throw new BadRequestException('Geçersiz dosya yolu');
  }
  const abs = join(root, file);
  const rel = relative(root, abs);
  if (rel.startsWith('..') || rel === '' || isAbsolute(rel)) throw new BadRequestException('Geçersiz dosya yolu');
  let real: string;
  try {
    real = realpathSync(abs);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT' || (e as NodeJS.ErrnoException).code === 'ENOTDIR') {
      throw new NotFoundException('Dosya bulunamadı');
    }
    throw e; // izin/I/O hatası: 404'e çevrilmez
  }
  const realRoot = realpathSync(root);
  if (!real.startsWith(realRoot + sep)) throw new NotFoundException('Dosya bulunamadı'); // kök dışına bağlantı
  return rel;
}

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
  private readonly logger = new Logger(UploadsController.name);

  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScopeService) {}

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
    @CurrentUser() user: AccessActor & { role?: string },
    @Res() res: Response,
  ) {
    const userId = user.id;
    const ctx = await this.scope.context(user);
    if (ctx.enforced) {
      // Kapsam açıkken: ayrı kanıt izni + bağlı kaydın kapsamı (liste/detayla aynı politika).
      this.scope.assertEvidencePermission(ctx);
      const attachment = await this.loadScopedAttachment(kind, id, ctx);
      return this.sendAttachment(attachment, download, res);
    }
    const elevated = ['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR'].includes(user.role ?? '');
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
    return this.sendAttachment(attachment, download, res);
  }

  // Kanıt, bağlı olduğu kaydın erişim politikasını izler. Kapsam dışı → 404.
  private async loadScopedAttachment(kind: string, id: string, ctx: Awaited<ReturnType<AccessScopeService['context']>>) {
    if (kind === 'control-test') {
      const a = await this.prisma.controlTestAttachment.findUnique({ where: { id } });
      if (!a) throw new NotFoundException('Kanıt bulunamadı');
      await this.scope.assertControlTestAccess(ctx, a.controlTestId);
      return a;
    }
    if (kind === 'finding') {
      const a = await this.prisma.findingAttachment.findUnique({ where: { id } });
      if (!a) throw new NotFoundException('Kanıt bulunamadı');
      // Bulgu kanıtı bulgunun TAMAMINA erişim ister; tek aksiyona atanmak yetmez.
      if ((await this.scope.findingAccess(ctx, a.findingId)) !== 'FULL') throw new NotFoundException('Kanıt bulunamadı');
      return a;
    }
    if (kind === 'action') {
      const a = await this.prisma.actionAttachment.findUnique({ where: { id } });
      if (!a) throw new NotFoundException('Kanıt bulunamadı');
      await this.scope.assertActionAccess(ctx, a.actionId);
      return a;
    }
    if (kind === 'follow-up') {
      const a = await this.prisma.followUpAttachment.findUnique({ where: { id } });
      if (!a) throw new NotFoundException('Kanıt bulunamadı');
      await this.scope.assertFollowUpAccess(ctx, a.followUpId);
      return a;
    }
    throw new BadRequestException('Geçersiz kanıt türü');
  }

  private sendAttachment(attachment: any, download: string | undefined, res: Response, root: string = UPLOAD_ROOT) {
    const rel = resolveUploadPath(attachment.fileName, root);
    const requestedName = String(attachment.displayName || attachment.originalName || 'dosya').replace(/[\r\n"]/g, '_');
    const originalExt = extname(String(attachment.originalName || '')).toLowerCase();
    const safeName = originalExt && extname(requestedName).toLowerCase() !== originalExt
      ? `${requestedName}${originalExt}`
      : requestedName;
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `${download === 'true' ? 'attachment' : 'inline'}; filename="${safeName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Dosya, yükleme köküne GÖRE gönderilir: nokta-dosya koruması yalnız göreli kısma uygulanır
    // (kök yolundaki klasör adları etkilemez; genel dotfiles erişimi açılmaz).
    return res.sendFile(rel, { root, dotfiles: 'deny' }, (err?: Error & { status?: number; statusCode?: number; code?: string }) => {
      if (!err) return;
      const status = err.status ?? err.statusCode;
      // Yalnız "dosya yok" (ENOENT → 404) ve nokta-dosya reddi (403) 404 olur. İzin/I/O gibi
      // gerçek sunucu hataları 500 kalır; iç yol istemciye yazılmaz, sunucu günlüğüne gider.
      const notFound = status === 404 || status === 403;
      if (!notFound) this.logger.error(`Kanıt dosyası gönderilemedi (${err.code ?? status ?? 'bilinmiyor'}): ${rel}`);
      if (res.headersSent) { res.end(); return; }
      res.removeHeader('Content-Disposition');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (notFound) res.status(404).json({ statusCode: 404, message: 'Dosya bulunamadı' });
      else res.status(500).json({ statusCode: 500, message: 'Dosya şu anda gönderilemiyor' });
    });
  }
}
