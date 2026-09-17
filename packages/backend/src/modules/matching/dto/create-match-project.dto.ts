import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { BlockingKind, FieldRole, MatchMode } from '../../../database/entities';

const MATCH_MODES: MatchMode[] = ['dedupe', 'link'];
const FIELD_ROLES: FieldRole[] = ['person_name', 'org_name', 'date', 'phone', 'identifier', 'address', 'text'];
const BLOCKING_KINDS: BlockingKind[] = ['equi', 'trigram'];
const SOURCE_KINDS = ['connection', 'staged'] as const;
type SourceKind = (typeof SOURCE_KINDS)[number];

/** A project's left/right source: either a live connection's table or a staged upload. */
export class MatchSourceRefDto {
  @IsIn(SOURCE_KINDS) kind: SourceKind;
  @IsOptional() @IsString() @IsNotEmpty() connectionId?: string;
  @IsOptional() @IsString() @IsNotEmpty() schemaName?: string;
  @IsOptional() @IsString() @IsNotEmpty() tableName?: string;
  @IsOptional() @IsString() @IsNotEmpty() stagedDataId?: string;
  @IsString() @IsNotEmpty() primaryKey: string;
}

/** One field's role, comparator and weight in the scoring formula. */
export class FieldMappingDto {
  @IsString() @IsNotEmpty() left: string;
  @IsString() @IsNotEmpty() right: string;
  @IsIn(FIELD_ROLES) role: FieldRole;
  @IsNumber() weight: number;
  @IsString() @IsNotEmpty() comparator: string;
}

/** One blocking pass: an equi-join key, or a trigram-similarity key with a threshold. */
export class BlockingPassDto {
  @IsString() @IsNotEmpty() name: string;
  @IsIn(BLOCKING_KINDS) kind: BlockingKind;
  @IsString() @IsNotEmpty() keyExpr: string;
  @IsOptional() @IsNumber() threshold?: number;
}

/**
 * Asserts `rejectAt <= matchAt` on the thresholds object it is attached
 * to. Inverted thresholds would make the grey band -- everything between
 * the two -- empty or nonsensical, which must be refused at creation time
 * rather than discovered when a run's scoring stage produces garbage.
 */
@ValidatorConstraint({ name: 'rejectAtNotAboveMatchAt', async: false })
class RejectAtNotAboveMatchAtConstraint implements ValidatorConstraintInterface {
  validate(rejectAt: unknown, args: ValidationArguments): boolean {
    const object = args.object as MatchThresholdsDto;
    return typeof object.matchAt === 'number' && typeof rejectAt === 'number' && rejectAt <= object.matchAt;
  }
  defaultMessage(): string {
    return 'rejectAt must be less than or equal to matchAt';
  }
}

export class MatchThresholdsDto {
  @IsNumber() @Min(0) @Max(1) matchAt: number;
  @IsNumber() @Min(0) @Max(1) @Validate(RejectAtNotAboveMatchAtConstraint) rejectAt: number;
}

export class CreateMatchProjectDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name: string;

  @IsOptional() @IsString() description?: string;

  @IsIn(MATCH_MODES) mode: MatchMode;

  @ValidateNested() @Type(() => MatchSourceRefDto) leftSource: MatchSourceRefDto;

  @IsOptional() @ValidateNested() @Type(() => MatchSourceRefDto) rightSource?: MatchSourceRefDto;

  @IsArray() @ValidateNested({ each: true }) @Type(() => FieldMappingDto) fieldMap: FieldMappingDto[];

  @IsArray() @ValidateNested({ each: true }) @Type(() => BlockingPassDto) blockingPasses: BlockingPassDto[];

  @ValidateNested() @Type(() => MatchThresholdsDto) thresholds: MatchThresholdsDto;

  /**
   * The legal boundary of what gets copied out of the source database. The
   * `Matches` pattern is what keeps a column name from ever reaching SQL
   * unescaped downstream (see `blocking-sql.ts:assertIdent`).
   */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @Matches(/^[A-Za-z0-9_]+$/, { each: true })
  columnAllowlist: string[];

  /** The recorded justification for copying citizen/business data. Required, non-empty. */
  @IsString() @IsNotEmpty() lawfulBasis: string;

  /** The accountable owner for this copy of the data. Required, non-empty. */
  @IsString() @IsNotEmpty() dataOwner: string;

  @IsInt() @Min(1) @Max(365) retentionDays: number;
}
