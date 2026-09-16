import { Controller, Post, HttpException, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles } from '../../common/decorators';

@ApiTags('Tests Generation')
@ApiBearerAuth('JWT-Auth')
@Controller('tests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TestsController {
    // Eski toplu üretici KAPATILDI — scopeId/periodKey taşımıyordu, dönem
    // motorundan (control-period.util.ts) bağımsızdı ve transaction'sız
    // çalışıyordu; Yıllık Plan'ın "tekrar güvenli" garantisini (ControlScope
    // motoru + @@unique([scopeId,periodKey])) baltalıyordu. Frontend'de
    // çağıran ekran yoktu (doğrulandı) — mevcut hiçbir iş akışı kırılmıyor.
    @Post('generate')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    generateTests(): never {
        throw new HttpException(
            'Bu uç nokta kaldırıldı. Task üretimi artık yalnızca Kontrol Yönetimi → Yıllık Plan (Planı Uygula) üzerinden, yıllık kapsam motoruyla yapılıyor.',
            HttpStatus.GONE,
        );
    }
}
