import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { withAuditContext } from '../common/context/request-context';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private pool: pg.Pool;

  constructor() {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    });

    super({
      adapter: new PrismaPg(pool),
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });

    this.pool = pool;

    // Denetim izi aktör bağlamı MERKEZİ olarak eklenir (106 ayrı yazım noktasına
    // dağıtılmaz): HTTP isteği → USER + IP + User-Agent; istek dışı → SYSTEM.
    // Interactive transaction'lar genişletilmiş istemciden açılır ki tx.auditLog da
    // bağlam alsın. Dizi biçimli $transaction'lar (auditLog içermez) temel istemcide kalır.
    const extended = this.$extends({
      query: {
        auditLog: {
          create({ args, query }) {
            args.data = withAuditContext(args.data as Record<string, unknown>) as typeof args.data;
            return query(args);
          },
          createMany({ args, query }) {
            const data = args.data as Record<string, unknown> | Record<string, unknown>[];
            args.data = (Array.isArray(data) ? data.map(d => withAuditContext(d)) : withAuditContext(data)) as typeof args.data;
            return query(args);
          },
        },
      },
    });
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop === 'auditLog') return extended.auditLog;
        if (prop === '$transaction') {
          return (arg: unknown, options?: unknown) =>
            typeof arg === 'function'
              ? (extended.$transaction as any)(arg, options)
              : (target.$transaction as any).call(target, arg, options);
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
