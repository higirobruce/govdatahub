import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsBoolean, IsOptional, IsIn, Min, Max } from 'class-validator';

export class CreateConnectionDto {
  @ApiProperty({
    example: 'Finance DB',
    description: 'Display name for the connection',
  })
  @IsString()
  name: string;

  @ApiProperty({
    example: 'postgresql',
    description: 'Database type',
    enum: ['postgresql', 'mysql'],
  })
  @IsString()
  @IsIn(['postgresql', 'mysql'])
  type: string;

  @ApiProperty({
    example: 'localhost',
    description: 'Database host',
  })
  @IsString()
  host: string;

  @ApiProperty({
    example: 5432,
    description: 'Database port',
  })
  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @ApiProperty({
    example: 'admin',
    description: 'Database username',
  })
  @IsString()
  username: string;

  @ApiProperty({
    example: 'password123',
    description: 'Database password',
  })
  @IsString()
  password: string;

  @ApiProperty({
    example: 'finance_db',
    description: 'Database name',
  })
  @IsString()
  database: string;

  @ApiProperty({
    example: false,
    description: 'Enable SSL connection',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  ssl?: boolean;
}
