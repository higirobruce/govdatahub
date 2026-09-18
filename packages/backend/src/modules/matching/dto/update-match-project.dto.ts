import { PartialType } from '@nestjs/swagger';
import { CreateMatchProjectDto } from './create-match-project.dto';

/**
 * Every field of `CreateMatchProjectDto`, optional -- but each one keeps
 * its original validation rules when present, including the nested
 * `thresholds` object's `rejectAt <= matchAt` constraint. `PartialType`
 * only relaxes presence, never the rule that applies once a value is
 * there.
 */
export class UpdateMatchProjectDto extends PartialType(CreateMatchProjectDto) {}
