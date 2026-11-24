import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Roles } from '../../common/decorators';
import { LdapConnectionsService } from './ldap-connections.service';
import { CreateLdapUserDto, LdapConnectionDto, LdapSearchQueryDto, LdapTestDto } from './dto/ldap.dto';

/** LDAP bağlantı yönetimi ve dizinden kullanıcı ekleme — yalnız sistem yöneticisi. */
@ApiTags('Admin - LDAP')
@ApiBearerAuth('JWT-Auth')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SYSTEM_ADMIN')
export class LdapController {
    constructor(private svc: LdapConnectionsService) { }

    @Get('ldap-connections')
    list() { return this.svc.list(); }

    @Post('ldap-connections')
    create(@Body() dto: LdapConnectionDto, @CurrentUser('id') userId: string) { return this.svc.create(dto, userId); }

    @Post('ldap-connections/test')
    testDraft(@Body() dto: LdapTestDto) { return this.svc.testDraft(dto); }

    @Put('ldap-connections/:id')
    update(@Param('id') id: string, @Body() dto: LdapConnectionDto, @CurrentUser('id') userId: string) { return this.svc.update(id, dto, userId); }

    @Delete('ldap-connections/:id')
    remove(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.svc.remove(id, userId); }

    @Post('ldap-connections/:id/test')
    test(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.svc.testSaved(id, userId); }

    @Get('ldap-connections/:id/search')
    search(@Param('id') id: string, @Query() q: LdapSearchQueryDto) { return this.svc.search(id, q.q); }

    @Post('users/ldap')
    createUser(@Body() dto: CreateLdapUserDto, @CurrentUser('id') userId: string) { return this.svc.createUser(dto, userId); }
}
