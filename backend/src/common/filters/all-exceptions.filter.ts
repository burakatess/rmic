import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import * as Sentry from '@sentry/nestjs';

/**
 * Genel (Prisma dışı) yakalanmamış hatalar için son çare filtresi.
 * Bilinen HttpException'ları olduğu gibi geçirir; beklenmeyen hataları
 * (TypeError, vs.) genel 500 olarak döner ve SENTRY_DSN tanımlıysa
 * Sentry'ye raporlar. PrismaExceptionFilter Prisma hatalarını zaten
 * daha spesifik olarak yakaladığı için burada tekrar işlenmez.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger('AllExceptionsFilter');

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();

        if (exception instanceof HttpException) {
            const status = exception.getStatus();
            if (status >= 500) {
                this.logger.error(exception.message, exception.stack);
                Sentry.captureException(exception);
            }
            return response.status(status).json(exception.getResponse());
        }

        this.logger.error(
            exception instanceof Error ? exception.message : 'Bilinmeyen hata',
            exception instanceof Error ? exception.stack : undefined,
        );
        Sentry.captureException(exception);

        return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'Sunucu hatası oluştu',
        });
    }
}
