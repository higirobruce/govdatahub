import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class ValidateSqlDto {
  @IsString() @IsNotEmpty() @MaxLength(65536) sqlQuery: string;
}
