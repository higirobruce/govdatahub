import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization, User } from '../../database/entities';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Organization, User])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
