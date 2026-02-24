import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { QualityCheck } from './quality-check.entity';

@Entity('quality_check_runs')
export class QualityCheckRun {
  @PrimaryColumn('text')
  id: string;

  @Column('text', { name: 'check_id' })
  checkId: string;

  @ManyToOne(() => QualityCheck, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'check_id' })
  check: QualityCheck;

  @Column('text', { name: 'organization_id' })
  organizationId: string;

  @Column('text')
  status: 'pass' | 'fail' | 'error';

  @Column('double precision', { nullable: true, name: 'actual_value' })
  actualValue: number | null;

  @Column('text', { nullable: true, name: 'expected_desc' })
  expectedDesc: string | null;

  @Column('text', { nullable: true, name: 'error_message' })
  errorMessage: string | null;

  @Column('integer', { nullable: true, name: 'duration_ms' })
  durationMs: number | null;

  @Column('timestamp', { name: 'ran_at', default: () => 'NOW()' })
  ranAt: Date;
}
