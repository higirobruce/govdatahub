import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataProduct, DataProductPort } from '../../database/entities';
import { DataProductsService } from './data-products.service';
import { DataProductsController } from './data-products.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DataProduct, DataProductPort])],
  controllers: [DataProductsController],
  providers: [DataProductsService],
  exports: [DataProductsService],
})
export class DataProductsModule {}
