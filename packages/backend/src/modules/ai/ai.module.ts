import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiConfig } from '../../database/entities/ai-config.entity';
import { EncryptionModule } from '../encryption/encryption.module';
import { AiConfigService } from './ai-config.service';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AiConfig]), EncryptionModule],
  providers: [AiConfigService, AiService],
  controllers: [AiController],
  exports: [AiConfigService, AiService],
})
export class AiModule {}
