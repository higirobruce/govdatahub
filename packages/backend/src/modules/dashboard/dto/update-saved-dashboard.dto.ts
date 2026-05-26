import { PartialType } from '@nestjs/mapped-types';
import { CreateSavedDashboardDto } from './create-saved-dashboard.dto';

export class UpdateSavedDashboardDto extends PartialType(CreateSavedDashboardDto) {}
