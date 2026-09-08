import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class ProfileTableDto {
  @IsString() @IsNotEmpty() connectionId: string;
  @IsString() @IsNotEmpty() @MaxLength(256) schemaName: string;
  @IsString() @IsNotEmpty() @MaxLength(256) tableName: string;
}
