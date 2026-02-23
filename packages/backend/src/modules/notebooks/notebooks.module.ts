import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notebook } from '../../database/entities/notebook.entity';
import { QueriesModule } from '../queries/queries.module';
import { TransformationsModule } from '../transformations/transformations.module';
import { NotebooksController } from './notebooks.controller';
import { NotebooksService } from './notebooks.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notebook]),
    QueriesModule,
    TransformationsModule,
  ],
  controllers: [NotebooksController],
  providers: [NotebooksService],
})
export class NotebooksModule {}
