import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UserRole } from '../../database/entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
import {
  AddGoldPairDto,
  CreateMatchProjectDto,
  GetCandidatesQueryDto,
  GetClustersQueryDto,
  SubmitDecisionDto,
  UpdateMatchProjectDto,
} from './dto';

/**
 * `MatchingController` is the feature's only entry point and therefore its
 * security boundary (see the module's file header). These tests cover
 * three things, deliberately kept apart:
 *
 *  1. Every handler forwards `user.organizationId` to the service and
 *     never anything the request supplied -- `MatchingService` is a jest
 *     mock throughout, so these are pure wiring tests.
 *  2. Every mutating route carries `@Roles(...editor+)`, and every
 *     read-only route carries none (which `RolesGuard` treats as "any
 *     authenticated role", not "denied").
 *  3. Every DTO validation rule actually rejects invalid input -- not just
 *     accepts valid input, which would pass against an undecorated field
 *     just as easily as a correctly decorated one.
 */
describe('MatchingController', () => {
  let controller: MatchingController;
  let service: {
    createProject: jest.Mock;
    listProjects: jest.Mock;
    findProject: jest.Mock;
    updateProject: jest.Mock;
    deleteProject: jest.Mock;
    estimate: jest.Mock;
    startRun: jest.Mock;
    listRuns: jest.Mock;
    findRun: jest.Mock;
    listCandidates: jest.Mock;
    recordDecision: jest.Mock;
    listClusters: jest.Mock;
    evaluate: jest.Mock;
    addGoldPair: jest.Mock;
  };

  const user = { id: 'u1', organizationId: 'org1' } as any;

  const dto = {
    name: 'Citizens dedupe',
    description: 'Quarterly household registry cleanup',
    mode: 'dedupe',
    leftSource: {
      kind: 'connection',
      connectionId: 'c1',
      schemaName: 'public',
      tableName: 'citizens',
      primaryKey: 'id',
    },
    fieldMap: [{ left: 'surname', right: 'surname', role: 'person_name', weight: 1, comparator: 'trgm' }],
    blockingPasses: [{ name: 'name_dob', kind: 'equi', keyExpr: 'surname' }],
    thresholds: { matchAt: 0.9, rejectAt: 0.55 },
    columnAllowlist: ['id', 'surname'],
    lawfulBasis: 'Law No. 058/2021 art. 12',
    dataOwner: 'registrar@example.gov',
    retentionDays: 30,
  };

  beforeEach(async () => {
    service = {
      createProject: jest.fn(),
      listProjects: jest.fn(),
      findProject: jest.fn(),
      updateProject: jest.fn(),
      deleteProject: jest.fn(),
      estimate: jest.fn(),
      startRun: jest.fn(),
      listRuns: jest.fn(),
      findRun: jest.fn(),
      listCandidates: jest.fn(),
      recordDecision: jest.fn(),
      listClusters: jest.fn(),
      evaluate: jest.fn(),
      addGoldPair: jest.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [MatchingController],
      providers: [{ provide: MatchingService, useValue: service }],
    }).compile();

    controller = module.get(MatchingController);
  });

  // ---------------------------------------------------------------------
  // Brief's Step 1 tests, verbatim
  // ---------------------------------------------------------------------

  it('creates a project scoped to the caller organization', async () => {
    await controller.createProject(dto as any, user);
    expect(service.createProject).toHaveBeenCalledWith(dto, 'org1');
  });

  /**
   * NOT `Object.assign(new CreateMatchProjectDto(), {...})` as the brief's
   * Step 1 code originally had it. `Object.assign` leaves `leftSource`,
   * `fieldMap`, `blockingPasses` and `thresholds` as plain object
   * literals rather than instances of their nested DTO classes, and
   * `@ValidateNested()` cannot recognize a plain object as "an instance of
   * the nested class" without `class-transformer` having run --
   * `validate()` alone reports a generic "unknown value" failure on each
   * of those four nested properties regardless of what the deliberately
   * broken field is. That makes `expect(errors.length).toBeGreaterThan(0)`
   * true unconditionally: it would pass against a `lawfulBasis` (or
   * `columnAllowlist`) with zero decorators at all, purely from that
   * baseline noise. `plainToInstance` is what the global `ValidationPipe`
   * (`transform: true`) actually runs on every request, and asserting the
   * specific constraint key -- not just "some error exists" -- is what
   * proves the rule under test is the one that fired.
   */
  it('rejects a create whose lawful basis is empty', async () => {
    const errors = await validate(plainToInstance(CreateMatchProjectDto, { ...dto, lawfulBasis: '' }));
    const lawfulBasisError = errors.find((error) => error.property === 'lawfulBasis');
    expect(lawfulBasisError?.constraints).toHaveProperty('isNotEmpty');
  });

  it('rejects a create whose data owner is missing', async () => {
    const errors = await validate(plainToInstance(CreateMatchProjectDto, { ...dto, dataOwner: undefined }));
    const dataOwnerError = errors.find((error) => error.property === 'dataOwner');
    expect(dataOwnerError?.constraints).toHaveProperty('isNotEmpty');
  });

  it('rejects a create whose column allow-list is empty', async () => {
    const errors = await validate(plainToInstance(CreateMatchProjectDto, { ...dto, columnAllowlist: [] }));
    const columnAllowlistError = errors.find((error) => error.property === 'columnAllowlist');
    expect(columnAllowlistError?.constraints).toHaveProperty('arrayNotEmpty');
  });

  it('rejects thresholds where rejectAt is above matchAt', async () => {
    const errors = await validate(
      Object.assign(new CreateMatchProjectDto(), { ...dto, thresholds: { matchAt: 0.5, rejectAt: 0.9 } }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('passes the organization id to every read so another tenant project is never returned', async () => {
    await controller.getProject('p1', user);
    expect(service.findProject).toHaveBeenCalledWith('p1', 'org1');
  });

  it('records the reviewing user on a decision', async () => {
    await controller.submitDecision('p1', { leftKey: 'a', rightKey: 'b', decision: 'match' } as any, user);
    expect(service.recordDecision).toHaveBeenCalledWith('p1', expect.anything(), 'org1', 'u1');
  });

  it('serves the review queue grey band first, ordered by score descending', async () => {
    await controller.getCandidates('r1', { decision: 'grey', limit: 50 } as any, user);
    expect(service.listCandidates).toHaveBeenCalledWith(
      'r1',
      'org1',
      expect.objectContaining({ decision: 'grey' }),
    );
  });

  // ---------------------------------------------------------------------
  // Every handler: organization comes from the caller, never the request
  // ---------------------------------------------------------------------

  describe('organization isolation on every route', () => {
    it('never accepts an organization id from the request; every handler forwards user.organizationId', async () => {
      await controller.listProjects(user);
      expect(service.listProjects).toHaveBeenCalledWith('org1');

      await controller.updateProject('p1', { name: 'x' } as any, user);
      expect(service.updateProject).toHaveBeenCalledWith('p1', { name: 'x' }, 'org1');

      await controller.deleteProject('p1', user);
      expect(service.deleteProject).toHaveBeenCalledWith('p1', 'org1');

      await controller.estimate('p1', user);
      expect(service.estimate).toHaveBeenCalledWith('p1', 'org1');

      await controller.startRun('p1', user);
      expect(service.startRun).toHaveBeenCalledWith('p1', 'org1');

      await controller.listRuns('p1', user);
      expect(service.listRuns).toHaveBeenCalledWith('p1', 'org1');

      await controller.getRun('r1', user);
      expect(service.findRun).toHaveBeenCalledWith('r1', 'org1');

      await controller.getClusters('r1', {} as any, user);
      expect(service.listClusters).toHaveBeenCalledWith('r1', 'org1', {});

      await controller.getEvaluate('r1', user);
      expect(service.evaluate).toHaveBeenCalledWith('r1', 'org1');

      await controller.addGoldPair('p1', { leftKey: 'a', rightKey: 'b', isMatch: true } as any, user);
      expect(service.addGoldPair).toHaveBeenCalledWith('p1', expect.anything(), 'org1', 'u1');
    });
  });

  // ---------------------------------------------------------------------
  // RBAC: the controller must not join the zero-guarded majority
  // ---------------------------------------------------------------------

  describe('RBAC', () => {
    it('guards the whole controller with JwtAuthGuard and RolesGuard', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, MatchingController);
      expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
    });

    const editorPlusHandlers = [
      'createProject',
      'updateProject',
      'deleteProject',
      'estimate',
      'startRun',
      'submitDecision',
      'addGoldPair',
    ] as const;

    it.each(editorPlusHandlers)('requires editor, org admin or super admin on %s', (handler) => {
      const roles = Reflect.getMetadata(ROLES_KEY, (MatchingController.prototype as any)[handler]);
      expect(roles).toEqual(
        expect.arrayContaining([UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EDITOR]),
      );
      expect(roles).not.toContain(UserRole.VIEWER);
    });

    const anyRoleHandlers = [
      'listProjects',
      'getProject',
      'listRuns',
      'getRun',
      'getCandidates',
      'getClusters',
      'getEvaluate',
    ] as const;

    it.each(anyRoleHandlers)('leaves %s open to any authenticated role (no @Roles restriction)', (handler) => {
      const roles = Reflect.getMetadata(ROLES_KEY, (MatchingController.prototype as any)[handler]);
      expect(roles).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------
  // R25: a verdict and a candidate decision are different types
  // ---------------------------------------------------------------------

  describe('SubmitDecisionDto validation', () => {
    const validDecision = {
      leftSourceRef: 'left-conn',
      leftKey: 'a',
      rightSourceRef: 'right-conn',
      rightKey: 'b',
      decision: 'match',
    };

    it('accepts a match verdict', async () => {
      const errors = await validate(plainToInstance(SubmitDecisionDto, validDecision));
      expect(errors).toHaveLength(0);
    });

    it('accepts a no_match verdict', async () => {
      const errors = await validate(plainToInstance(SubmitDecisionDto, { ...validDecision, decision: 'no_match' }));
      expect(errors).toHaveLength(0);
    });

    it.each(['confirmed', 'rejected', 'auto_match', 'grey'])(
      'rejects the candidate-state value "%s" as a decision (Ruling R25)',
      async (candidateState) => {
        const errors = await validate(
          plainToInstance(SubmitDecisionDto, { ...validDecision, decision: candidateState }),
        );
        expect(errors.length).toBeGreaterThan(0);
      },
    );

    it('rejects a missing leftKey', async () => {
      const errors = await validate(
        plainToInstance(SubmitDecisionDto, { ...validDecision, leftKey: undefined }),
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects an empty rightSourceRef', async () => {
      const errors = await validate(plainToInstance(SubmitDecisionDto, { ...validDecision, rightSourceRef: '' }));
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------
  // R28: match_gold_pairs has no source-ref columns
  // ---------------------------------------------------------------------

  describe('AddGoldPairDto validation', () => {
    const validPair = { leftKey: 'a', rightKey: 'b', isMatch: true };

    it('accepts a valid gold pair', async () => {
      const errors = await validate(plainToInstance(AddGoldPairDto, validPair));
      expect(errors).toHaveLength(0);
    });

    it('rejects a non-boolean isMatch', async () => {
      const errors = await validate(plainToInstance(AddGoldPairDto, { ...validPair, isMatch: 'yes' }));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects a missing leftKey', async () => {
      const errors = await validate(plainToInstance(AddGoldPairDto, { ...validPair, leftKey: undefined }));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects an empty rightKey', async () => {
      const errors = await validate(plainToInstance(AddGoldPairDto, { ...validPair, rightKey: '' }));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('has no source-ref columns: an extraneous leftSourceRef is rejected under whitelist validation, not silently accepted', async () => {
      const instance = plainToInstance(AddGoldPairDto, { ...validPair, leftSourceRef: 'left-conn' });
      const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------
  // CreateMatchProjectDto: every declared rule proven to reject
  // ---------------------------------------------------------------------

  describe('CreateMatchProjectDto validation', () => {
    it('accepts a fully valid payload', async () => {
      const errors = await validate(plainToInstance(CreateMatchProjectDto, dto));
      expect(errors).toHaveLength(0);
    });

    it('rejects a non-string name', async () => {
      const errors = await validate(plainToInstance(CreateMatchProjectDto, { ...dto, name: 12345 }));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects an empty name', async () => {
      const errors = await validate(plainToInstance(CreateMatchProjectDto, { ...dto, name: '' }));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects a name over 200 characters', async () => {
      const errors = await validate(plainToInstance(CreateMatchProjectDto, { ...dto, name: 'x'.repeat(201) }));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects a mode outside dedupe/link', async () => {
      const errors = await validate(plainToInstance(CreateMatchProjectDto, { ...dto, mode: 'delete' }));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects a data owner that is an empty string', async () => {
      const errors = await validate(plainToInstance(CreateMatchProjectDto, { ...dto, dataOwner: '' }));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects a column allow-list entry that is not a bare identifier', async () => {
      const errors = await validate(
        plainToInstance(CreateMatchProjectDto, { ...dto, columnAllowlist: ['ok_col', 'bad; drop table'] }),
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects a column allow-list entry containing a space', async () => {
      const errors = await validate(
        plainToInstance(CreateMatchProjectDto, { ...dto, columnAllowlist: ['not a column'] }),
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects retentionDays below the minimum', async () => {
      const errors = await validate(plainToInstance(CreateMatchProjectDto, { ...dto, retentionDays: 0 }));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects retentionDays above the maximum', async () => {
      const errors = await validate(plainToInstance(CreateMatchProjectDto, { ...dto, retentionDays: 366 }));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects a non-integer retentionDays', async () => {
      const errors = await validate(plainToInstance(CreateMatchProjectDto, { ...dto, retentionDays: 30.5 }));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('accepts thresholds where rejectAt is below matchAt (the constraint must not over-reject)', async () => {
      const errors = await validate(
        plainToInstance(CreateMatchProjectDto, { ...dto, thresholds: { matchAt: 0.9, rejectAt: 0.5 } }),
      );
      expect(errors).toHaveLength(0);
    });

    it('rejects thresholds where rejectAt equals matchAt plus a hair (rejectAt above matchAt) via the specific custom constraint, not a generic nested failure', async () => {
      const instance = plainToInstance(CreateMatchProjectDto, {
        ...dto,
        thresholds: { matchAt: 0.5, rejectAt: 0.9 },
      });
      const errors = await validate(instance);
      const thresholdsError = errors.find((error) => error.property === 'thresholds');
      const rejectAtError = thresholdsError?.children?.find((child) => child.property === 'rejectAt');
      expect(rejectAtError?.constraints).toHaveProperty('rejectAtNotAboveMatchAt');
    });

    it('accepts rejectAt exactly equal to matchAt (the boundary is inclusive)', async () => {
      const errors = await validate(
        plainToInstance(CreateMatchProjectDto, { ...dto, thresholds: { matchAt: 0.7, rejectAt: 0.7 } }),
      );
      expect(errors).toHaveLength(0);
    });

    it('rejects a threshold above 1', async () => {
      const errors = await validate(
        plainToInstance(CreateMatchProjectDto, { ...dto, thresholds: { matchAt: 1.5, rejectAt: 0.5 } }),
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects a threshold below 0', async () => {
      const errors = await validate(
        plainToInstance(CreateMatchProjectDto, { ...dto, thresholds: { matchAt: 0.9, rejectAt: -0.1 } }),
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects a field map entry with an unknown role', async () => {
      const errors = await validate(
        plainToInstance(CreateMatchProjectDto, {
          ...dto,
          fieldMap: [{ left: 'a', right: 'a', role: 'bogus_role', weight: 1, comparator: 'exact' }],
        }),
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects a field map entry missing its comparator', async () => {
      const errors = await validate(
        plainToInstance(CreateMatchProjectDto, {
          ...dto,
          fieldMap: [{ left: 'a', right: 'a', role: 'text', weight: 1, comparator: '' }],
        }),
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects a blocking pass with an unknown kind', async () => {
      const errors = await validate(
        plainToInstance(CreateMatchProjectDto, {
          ...dto,
          blockingPasses: [{ name: 'p', kind: 'fuzzy', keyExpr: 'x' }],
        }),
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects a left source with an invalid kind', async () => {
      const errors = await validate(
        plainToInstance(CreateMatchProjectDto, {
          ...dto,
          leftSource: { kind: 'ftp', primaryKey: 'id' },
        }),
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects a left source missing its primary key', async () => {
      const errors = await validate(
        plainToInstance(CreateMatchProjectDto, {
          ...dto,
          leftSource: { kind: 'connection', connectionId: 'c1', tableName: 'citizens' },
        }),
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects an organization id supplied in the body outright (never trusted from the request)', async () => {
      const instance = plainToInstance(CreateMatchProjectDto, { ...dto, organizationId: 'org-evil' });
      const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------
  // UpdateMatchProjectDto: PartialType must not relax the rules themselves
  // ---------------------------------------------------------------------

  describe('UpdateMatchProjectDto validation', () => {
    it('accepts an empty patch (every field is optional)', async () => {
      const errors = await validate(plainToInstance(UpdateMatchProjectDto, {}));
      expect(errors).toHaveLength(0);
    });

    it('still rejects an inverted threshold on a partial update', async () => {
      const errors = await validate(
        plainToInstance(UpdateMatchProjectDto, { thresholds: { matchAt: 0.5, rejectAt: 0.9 } }),
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('still enforces the column allow-list pattern on a partial update', async () => {
      const errors = await validate(plainToInstance(UpdateMatchProjectDto, { columnAllowlist: ['bad col'] }));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('still enforces retentionDays bounds on a partial update', async () => {
      const errors = await validate(plainToInstance(UpdateMatchProjectDto, { retentionDays: 1000 }));
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------
  // GetCandidatesQueryDto: the review queue's own filter vocabulary
  // ---------------------------------------------------------------------

  describe('GetCandidatesQueryDto validation', () => {
    it('accepts an empty query (every field optional)', async () => {
      const errors = await validate(plainToInstance(GetCandidatesQueryDto, {}));
      expect(errors).toHaveLength(0);
    });

    it('accepts a valid CandidateDecision filter', async () => {
      const errors = await validate(plainToInstance(GetCandidatesQueryDto, { decision: 'grey' }));
      expect(errors).toHaveLength(0);
    });

    it('rejects a MatchVerdict value ("match") as a candidate decision filter -- the two vocabularies are distinct', async () => {
      const errors = await validate(plainToInstance(GetCandidatesQueryDto, { decision: 'match' }));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects a limit above the cap', async () => {
      const errors = await validate(plainToInstance(GetCandidatesQueryDto, { limit: '5000' }));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects a negative offset', async () => {
      const errors = await validate(plainToInstance(GetCandidatesQueryDto, { offset: '-1' }));
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------
  // GetClustersQueryDto: pagination for the (potentially millions-of-rows)
  // cluster list -- Minor finding 4, "GET runs/:runId/clusters is unbounded"
  // ---------------------------------------------------------------------

  describe('GetClustersQueryDto validation', () => {
    it('accepts an empty query (every field optional)', async () => {
      const errors = await validate(plainToInstance(GetClustersQueryDto, {}));
      expect(errors).toHaveLength(0);
    });

    it('rejects a limit above the cap', async () => {
      const errors = await validate(plainToInstance(GetClustersQueryDto, { limit: '5000' }));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects a negative offset', async () => {
      const errors = await validate(plainToInstance(GetClustersQueryDto, { offset: '-1' }));
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
