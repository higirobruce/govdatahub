import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {
  Connection,
  QueryHistory,
  CachedResult,
  Transformation,
  TransformationRun,
  Organization,
  User,
  FdwServer,
  SavedCrossQuery,
} from './database/entities';
import { EncryptionModule } from './modules/encryption/encryption.module';
import { ConnectionsModule } from './modules/connections/connections.module';
import { SchemaModule } from './modules/schema/schema.module';
import { QueriesModule } from './modules/queries/queries.module';
import { TransformationsModule } from './modules/transformations/transformations.module';
import { AuthModule } from './modules/auth/auth.module';
import { CrossQueryModule } from './modules/cross-query/cross-query.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Database
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get('DB_USERNAME', 'admin'),
        password: configService.get('DB_PASSWORD', 'admin123'),
        database: configService.get('DB_DATABASE', 'govdatahub'),
        entities: [
          Connection,
          QueryHistory,
          CachedResult,
          Transformation,
          TransformationRun,
          Organization,
          User,
          FdwServer,
          SavedCrossQuery,
        ],
        synchronize: false, // Use migrations
        logging: configService.get('NODE_ENV') === 'development',
      }),
    }),

    // Rate Limiting
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: configService.get<number>('THROTTLE_TTL', 60000),
            limit: configService.get<number>('THROTTLE_LIMIT', 30),
          },
        ],
      }),
    }),

    // Scheduling (for cleanup tasks)
    ScheduleModule.forRoot(),

    // Feature modules
    EncryptionModule,
    AuthModule,
    ConnectionsModule,
    SchemaModule,
    QueriesModule,
    TransformationsModule,
    CrossQueryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
