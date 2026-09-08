import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class SuggestChecksDto {
  @IsString() @IsNotEmpty() connectionId: string;
  @IsString() @IsNotEmpty() @MaxLength(256) schemaName: string;
  @IsString() @IsNotEmpty() @MaxLength(256) tableName: string;
}
