import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class SaveAsTransformationDto {
  @ApiProperty({ example: 'Clean Customer Data' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Removes nulls and normalizes customer records' })
  @IsString()
  description: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsString()
  sourceConnectionId: string;

  @ApiProperty({ example: 'SELECT * FROM customers WHERE email IS NOT NULL' })
  @IsString()
  combinedSql: string;
}
