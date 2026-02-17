import { ApiProperty } from '@nestjs/swagger';

export class FieldMetadataDto {
  @ApiProperty({ example: 'name' })
  name: string;

  @ApiProperty({ example: 'text' })
  type: string;
}

export class CrossQueryResultDto {
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  rows: any[];

  @ApiProperty({ example: 100 })
  rowCount: number;

  @ApiProperty({ type: [FieldMetadataDto] })
  fields: FieldMetadataDto[];

  @ApiProperty({ example: 1234 })
  executionTimeMs: number;

  @ApiProperty({ example: 'SELECT u.name, o.total FROM ...' })
  generatedSql: string;
}
