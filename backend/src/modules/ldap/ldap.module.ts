import { Module } from '@nestjs/common';
import { LdapService } from './ldap.service';
import { LdapConnectionsService } from './ldap-connections.service';
import { LdapController } from './ldap.controller';

@Module({
    providers: [LdapService, LdapConnectionsService],
    controllers: [LdapController],
    exports: [LdapService],
})
export class LdapModule { }
