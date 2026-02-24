import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  OrganizationSettings,
  Transformation,
  Pipeline,
  QueryHistory,
} from '../../database/entities';
import { EncryptionModule } from '../encryption/encryption.module';
import { ConnectionsModule } from '../connections/connections.module';
import { SchemaModule } from '../schema/schema.module';
import { LineageModule } from '../lineage/lineage.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { OpenMetadataClientService } from './openmetadata-client.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrganizationSettings, Transformation, Pipeline, QueryHistory]),
    EncryptionModule,
    ConnectionsModule,
    SchemaModule,
    LineageModule,
  ],
  controllers: [CatalogController],
  providers: [CatalogService, OpenMetadataClientService],
  exports: [CatalogService],
})
export class CatalogModule {}
