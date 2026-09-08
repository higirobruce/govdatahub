import { ROLES_KEY } from './decorators/roles.decorator';
import { UserRole } from '../../database/entities';
import { ConnectionsController } from '../connections/connections.controller';
import { SettingsController } from '../settings/settings.controller';
import { DashboardController } from '../dashboard/dashboard.controller';
import { TransformationsController } from '../transformations/transformations.controller';
import { PipelinesController } from '../pipelines/pipelines.controller';
import { IngestionController } from '../ingestion/ingestion.controller';
import { DataQualityController } from '../data-quality/data-quality.controller';
import { NotebooksController } from '../notebooks/notebooks.controller';

const rolesOf = (controller: any, method: string): UserRole[] | undefined =>
  Reflect.getMetadata(ROLES_KEY, controller.prototype[method]);

const ADMINS = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN];
const EDITORS = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EDITOR];

describe('RBAC policy (SEC-10)', () => {
  it('admin-only surfaces carry admin roles', () => {
    expect(rolesOf(ConnectionsController, 'create')).toEqual(ADMINS);
    expect(rolesOf(ConnectionsController, 'remove')).toEqual(ADMINS);
    expect(rolesOf(SettingsController, 'updateSettings')).toEqual(ADMINS);
    expect(rolesOf(DashboardController, 'createShare')).toEqual(ADMINS);
    expect(rolesOf(DashboardController, 'deleteShare')).toEqual(ADMINS);
  });

  it('editor surfaces carry editor roles', () => {
    expect(rolesOf(TransformationsController, 'executeNow')).toEqual(EDITORS);
    expect(rolesOf(PipelinesController, 'create')).toEqual(EDITORS);
    expect(rolesOf(IngestionController, 'upload')).toEqual(EDITORS);
    expect(rolesOf(DataQualityController, 'createCheck')).toEqual(EDITORS);
    expect(rolesOf(NotebooksController, 'create')).toEqual(EDITORS);
  });
});
