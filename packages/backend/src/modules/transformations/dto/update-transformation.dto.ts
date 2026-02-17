import { PartialType } from '@nestjs/swagger';
import { CreateTransformationDto } from './create-transformation.dto';

export class UpdateTransformationDto extends PartialType(
  CreateTransformationDto,
) {}
