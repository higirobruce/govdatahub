import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { IsSafeSql } from '../../queries/validators/safe-sql.validator';

export class ExecuteCellDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsString()
  connectionId: string;

  @ApiProperty({ example: 'SELECT * FROM users LIMIT 10' })
  @IsString()
  @IsSafeSql()
  sql: string;
}
