import { Controller, Post, Body, Get, Patch, UseGuards, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, RefreshTokenDto, UpdateProfileDto, ChangePasswordDto } from './dto';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Public, Roles } from '../../common/decorators';

// Hassas auth route'ları için sıkı rate limit — brute-force koruması (CLAUDE.md önerisi: 5 istek/60sn)
const AUTH_THROTTLE = { default: { limit: 5, ttl: 60000 } };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @Public()
    @Throttle(AUTH_THROTTLE)
    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }

    // Genel/anonim kayıt KAPALI — yetki yükseltme riski (client roleId belirleyebiliyordu).
    // Gerçek kullanıcı oluşturma akışı: POST /admin/users (SYSTEM_ADMIN korumalı).
    // Bu endpoint yalnızca SYSTEM_ADMIN tarafından kullanılabilir; frontend'de çağrılmıyor.
    @Throttle(AUTH_THROTTLE)
    @Post('register')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('SYSTEM_ADMIN')
    async register(@Body() registerDto: RegisterDto) {
        return this.authService.register(registerDto);
    }

    @Public()
    @Throttle(AUTH_THROTTLE)
    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
        return this.authService.refreshToken(refreshTokenDto.refreshToken);
    }

    @Post('logout')
    @UseGuards(JwtAuthGuard)
    @HttpCode(HttpStatus.OK)
    async logout(@Req() req: Request & { user: { id: string } }, @Body() body: { refreshToken?: string }) {
        await this.authService.logout(req.user.id, body.refreshToken);
        return { message: 'Logged out successfully' };
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    async getProfile(@Req() req: Request & { user: { id: string } }) {
        return this.authService.getProfile(req.user.id);
    }

    @Patch('me')
    @UseGuards(JwtAuthGuard)
    async updateProfile(
        @Req() req: Request & { user: { id: string } },
        @Body() dto: UpdateProfileDto,
    ) {
        return this.authService.updateProfile(req.user.id, dto);
    }

    @Post('change-password')
    @UseGuards(JwtAuthGuard)
    @HttpCode(HttpStatus.OK)
    async changePassword(
        @Req() req: Request & { user: { id: string } },
        @Body() dto: ChangePasswordDto,
    ) {
        return this.authService.changePassword(req.user.id, dto);
    }
}
