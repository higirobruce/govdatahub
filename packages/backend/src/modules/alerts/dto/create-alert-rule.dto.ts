import { IsString, IsNumber, IsEnum, IsOptional, IsBoolean, IsArray, IsInt, Min, ValidateNested, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { AlertOperator } from '../../../database/entities';

class NotificationChannelDto {
  @IsEnum(['email', 'slack']) type: 'email' | 'slack';
  @IsString() target: string;
}

export class CreateAlertRuleDto {
  @IsString() name: string;
  @IsString() @IsOptional() description?: string;
  @IsString() connectionId: string;
  @IsString() sql: string;
  @IsNumber() thresholdValue: number;
  @IsEnum(['gt', 'lt', 'eq', 'gte', 'lte', 'ne']) thresholdOperator: AlertOperator;
  @IsInt() @Min(1) @IsOptional() checkIntervalMinutes?: number;
  @IsArray() @ValidateNested({ each: true }) @ArrayMaxSize(10) @Type(() => NotificationChannelDto) @IsOptional() notificationChannels?: NotificationChannelDto[];
  @IsBoolean() @IsOptional() enabled?: boolean;
}
