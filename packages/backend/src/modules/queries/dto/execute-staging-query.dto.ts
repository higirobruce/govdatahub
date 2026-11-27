import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class ExecuteStagingQueryDto {
  @IsString() @IsNotEmpty() @MaxLength(65536) sqlQuery: string;
}
