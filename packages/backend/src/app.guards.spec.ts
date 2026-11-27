import { APP_GUARD } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './modules/auth/decorators/public.decorator';
import { PublicDatasetController } from './modules/dashboard/public-dataset.controller';
import { AppController } from './app.controller';

describe('Global guard wiring', () => {
  it('app.module registers JwtAuthGuard, RolesGuard and ThrottlerGuard as APP_GUARDs', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AppModule } = require('./app.module');
    const providers = Reflect.getMetadata('providers', AppModule) ?? [];
    const appGuards = providers.filter(
      (p: any) => p && typeof p === 'object' && p.provide === APP_GUARD,
    );
    const guardNames = appGuards.map((p: any) => p.useClass?.name);
    expect(guardNames).toContain('JwtAuthGuard');
    expect(guardNames).toContain('RolesGuard');
    expect(guardNames).toContain('ThrottlerGuard');
  });

  it('registers the global guards in the order: JwtAuthGuard, RolesGuard, ThrottlerGuard', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AppModule } = require('./app.module');
    const providers = Reflect.getMetadata('providers', AppModule) ?? [];
    const appGuards = providers.filter(
      (p: any) => p && typeof p === 'object' && p.provide === APP_GUARD,
    );
    const guardNames = appGuards.map((p: any) => p.useClass?.name);
    expect(guardNames).toEqual(['JwtAuthGuard', 'RolesGuard', 'ThrottlerGuard']);
  });

  it('PublicDatasetController is marked @Public', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PublicDatasetController)).toBe(true);
  });

  it('AppController root handler is marked @Public', () => {
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, AppController.prototype.getHello),
    ).toBe(true);
  });
});
