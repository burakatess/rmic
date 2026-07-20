import {
    ArgumentsHost,
    Catch,
    ConflictException,
    ExceptionFilter,
    BadRequestException,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@prisma/client';

/**
 * Prisma hatalarının çıplak (stack/mesaj dahil) istemciye sızmasını önler.
 * Bilinen hata kodlarını temiz, Türkçe Nest exception'larına eşler; geri kalanı
 * genel 400/500 olarak döner. Ayrıntılı hata sunucu logına yazılır, response'a değil.
 *
 * Not: Servis katmanındaki `findUnique` ile önceden FK doğrulaması yapan kontroller
 * (CLAUDE.md'de belgelenen desen) hâlâ birincil savunma hattıdır — bu filter yalnızca
 * kaçanları yakalayan son çaredir.
 */
@Catch(
    Prisma.PrismaClientKnownRequestError,
    Prisma.PrismaClientValidationError,
    Prisma.PrismaClientInitializationError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger('PrismaExceptionFilter');

    catch(
        exception:
            | Prisma.PrismaClientKnownRequestError
            | Prisma.PrismaClientValidationError
            | Prisma.PrismaClientInitializationError,
        host: ArgumentsHost,
    ) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();

        this.logger.error(exception.message, exception.stack);

        if (exception instanceof Prisma.PrismaClientKnownRequestError) {
            switch (exception.code) {
                case 'P2002': {
                    const target = Array.isArray(exception.meta?.target)
                        ? (exception.meta!.target as string[]).join(', ')
                        : undefined;
                    return this.send(response, new ConflictException(
                        target ? `Bu kayıt zaten mevcut (${target})` : 'Bu kayıt zaten mevcut',
                    ));
                }
                case 'P2003':
                    return this.send(response, new BadRequestException('İlişkili kayıt bulunamadı veya geçersiz'));
                case 'P2025':
                    return this.send(response, new NotFoundException('Kayıt bulunamadı'));
                default:
                    return this.send(response, new BadRequestException('İşlem gerçekleştirilemedi'));
            }
        }

        // PrismaClientValidationError / PrismaClientInitializationError — asıl mesajı sızdırma
        return this.send(response, new BadRequestException('Geçersiz istek verisi'));
    }

    private send(response: Response, mapped: BadRequestException | ConflictException | NotFoundException) {
        const status = mapped.getStatus();
        const body = mapped.getResponse();
        response.status(status).json(body);
    }
}
