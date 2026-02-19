import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject, IsUUID, IsEnum } from 'class-validator';
import { ImportTargetType } from '../../../database/entities';

export class UploadFileDto {
  @ApiProperty({
    example: ImportTargetType.STAGING,
    description: 'Target type for imported data',
    enum: ImportTargetType
  })
  @IsEnum(ImportTargetType)
  targetType: ImportTargetType;

  @ApiProperty({
    example: 'users',
    description: 'Target table name (required for database target)',
    required: false
  })
  @IsOptional()
  @IsString()
  targetTable?: string;

  @ApiProperty({
    example: 'uuid-of-connection',
    description: 'Connection ID (required for database target)',
    required: false
  })
  @IsOptional()
  @IsUUID()
  connectionId?: string;

  @ApiProperty({
    example: { delimiter: ',', hasHeader: true },
    description: 'Parser configuration (CSV options, etc.)',
    required: false
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}
