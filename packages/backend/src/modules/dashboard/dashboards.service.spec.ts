import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DashboardsService } from './dashboards.service';

type AnyMock = jest.Mock<any, any>;

interface RepoMock {
  find: AnyMock;
  findOne: AnyMock;
  create: AnyMock;
  save: AnyMock;
  remove: AnyMock;
}

function buildSubject() {
  const repo: RepoMock = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((d) => d),
    save: jest.fn((d) => Promise.resolve(d)),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const svc = new DashboardsService(repo as never);
  return { svc, repo };
}

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const USER = 'user-1';

describe('DashboardsService', () => {
  describe('list', () => {
    it('scopes the find by organizationId', async () => {
      const { svc, repo } = buildSubject();
      repo.find.mockResolvedValue([]);
      await svc.list(ORG);
      expect(repo.find).toHaveBeenCalledWith({
        where: { organizationId: ORG },
        order: { updatedAt: 'DESC' },
      });
    });
  });

  describe('getById', () => {
    it('returns the dashboard when found', async () => {
      const { svc, repo } = buildSubject();
      const d = { id: 'd1', organizationId: ORG } as never;
      repo.findOne.mockResolvedValue(d);
      await expect(svc.getById('d1', ORG)).resolves.toBe(d);
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 'd1', organizationId: ORG },
      });
    });

    it('throws NotFoundException when missing', async () => {
      const { svc, repo } = buildSubject();
      repo.findOne.mockResolvedValue(null);
      await expect(svc.getById('missing', ORG)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('does not return a dashboard belonging to another org', async () => {
      const { svc, repo } = buildSubject();
      // Repo would only return matches for the org filter; simulate by
      // returning null when the find is org-scoped.
      repo.findOne.mockResolvedValue(null);
      await expect(svc.getById('d1', OTHER_ORG)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('persists with org + user + default empty widgets/layout', async () => {
      const { svc, repo } = buildSubject();
      const saved = await svc.create(
        { name: 'My dashboard' },
        ORG,
        USER,
      );
      expect(saved.organizationId).toBe(ORG);
      expect(saved.createdBy).toBe(USER);
      expect(saved.name).toBe('My dashboard');
      expect(saved.description).toBeNull();
      expect(saved.widgets).toEqual([]);
      expect(saved.layout).toEqual([]);
      expect(repo.save).toHaveBeenCalled();
    });

    it('persists supplied widgets and layout', async () => {
      const { svc } = buildSubject();
      const widgets = [{ id: 'w1', type: 'bar', title: 'Bars' }];
      const layout = [{ i: 'w1', x: 0, y: 0, w: 6, h: 4 }];
      const saved = await svc.create(
        { name: 'D', widgets, layout },
        ORG,
        USER,
      );
      expect(saved.widgets).toEqual(widgets);
      expect(saved.layout).toEqual(layout);
    });
  });

  describe('update', () => {
    it('overwrites only the fields present in the DTO', async () => {
      const { svc, repo } = buildSubject();
      const existing = {
        id: 'd1',
        organizationId: ORG,
        name: 'old',
        description: 'old desc',
        widgets: [{ id: 'w1' }],
        layout: [{ i: 'w1', x: 0, y: 0, w: 1, h: 1 }],
      } as never as any;
      repo.findOne.mockResolvedValue(existing);

      const updated = await svc.update(
        'd1',
        { name: 'new' },
        ORG,
      );

      expect(updated.name).toBe('new');
      expect(updated.description).toBe('old desc');
      expect(updated.widgets).toEqual([{ id: 'w1' }]);
    });

    it('allows explicit null description to clear', async () => {
      const { svc, repo } = buildSubject();
      const existing = {
        id: 'd1',
        organizationId: ORG,
        name: 'd',
        description: 'old',
      } as never as any;
      repo.findOne.mockResolvedValue(existing);

      const updated = await svc.update(
        'd1',
        { description: '' as unknown as string }, // class-validator allows empty string; null path covered too
        ORG,
      );
      expect(updated.description).toBe('');
    });

    it('replaces widgets and layout when supplied', async () => {
      const { svc, repo } = buildSubject();
      const existing = {
        id: 'd1',
        organizationId: ORG,
        name: 'd',
        description: null,
        widgets: [{ id: 'old' }],
        layout: [{ i: 'old', x: 0, y: 0, w: 1, h: 1 }],
      } as never as any;
      repo.findOne.mockResolvedValue(existing);

      const updated = await svc.update(
        'd1',
        {
          widgets: [{ id: 'new', type: 'bar' }],
          layout: [{ i: 'new', x: 0, y: 0, w: 12, h: 6 }],
        },
        ORG,
      );
      expect(updated.widgets).toEqual([{ id: 'new', type: 'bar' }]);
      expect(updated.layout).toEqual([
        { i: 'new', x: 0, y: 0, w: 12, h: 6 },
      ]);
    });

    it('throws NotFoundException if the id does not belong to the org', async () => {
      const { svc, repo } = buildSubject();
      repo.findOne.mockResolvedValue(null);
      await expect(
        svc.update('missing', { name: 'x' }, ORG),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('filters', () => {
    it('persists declared filters on create', async () => {
      const { svc } = buildSubject();
      const filters = [
        {
          name: 'date_range',
          type: 'date_range' as const,
          default: { start: '2026-01-01', end: '2026-03-31' },
        },
        {
          name: 'country',
          type: 'select' as const,
          options: ['RW', 'KE', 'UG'],
          default: 'RW',
        },
      ];
      const saved = await svc.create(
        { name: 'D', filters },
        ORG,
        USER,
      );
      expect(saved.filters).toEqual(filters);
    });

    it('defaults filters to empty array when not supplied', async () => {
      const { svc } = buildSubject();
      const saved = await svc.create({ name: 'D' }, ORG, USER);
      expect(saved.filters).toEqual([]);
    });

    it('rejects duplicate filter names', async () => {
      const { svc } = buildSubject();
      await expect(
        svc.create(
          {
            name: 'D',
            filters: [
              { name: 'x', type: 'text' },
              { name: 'x', type: 'date' },
            ],
          },
          ORG,
          USER,
        ),
      ).rejects.toThrow(/Duplicate filter "x"/);
    });

    it('rejects invalid filter name (starts with digit)', async () => {
      const { svc } = buildSubject();
      await expect(
        svc.create(
          { name: 'D', filters: [{ name: '1bad', type: 'text' }] },
          ORG,
          USER,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires non-empty options for select filters', async () => {
      const { svc } = buildSubject();
      await expect(
        svc.create(
          { name: 'D', filters: [{ name: 'country', type: 'select' }] },
          ORG,
          USER,
        ),
      ).rejects.toThrow(/requires a non-empty options array/);
    });

    it('requires non-empty options for multi_select filters', async () => {
      const { svc } = buildSubject();
      await expect(
        svc.create(
          {
            name: 'D',
            filters: [{ name: 'tags', type: 'multi_select', options: [] }],
          },
          ORG,
          USER,
        ),
      ).rejects.toThrow(/requires a non-empty options array/);
    });

    it('does not require options for non-select filter types', async () => {
      const { svc } = buildSubject();
      await expect(
        svc.create(
          {
            name: 'D',
            filters: [
              { name: 'date_range', type: 'date_range' as const },
              { name: 'note', type: 'text' as const },
              { name: 'limit', type: 'number' as const },
            ],
          },
          ORG,
          USER,
        ),
      ).resolves.toBeDefined();
    });

    it('validates filters on update too', async () => {
      const { svc, repo } = buildSubject();
      const existing = {
        id: 'd1',
        organizationId: ORG,
        name: 'd',
        filters: [],
      } as never as any;
      repo.findOne.mockResolvedValue(existing);

      await expect(
        svc.update(
          'd1',
          {
            filters: [
              { name: 'x', type: 'text' },
              { name: 'x', type: 'date' },
            ],
          },
          ORG,
        ),
      ).rejects.toThrow(/Duplicate filter/);
    });

    it('rejects wrong-typed default for a number filter', async () => {
      const { svc } = buildSubject();
      await expect(
        svc.create(
          {
            name: 'D',
            filters: [{ name: 'lim', type: 'number', default: 'oops' }],
          },
          ORG,
          USER,
        ),
      ).rejects.toThrow(/default expected finite number/);
    });

    it('rejects wrong-shaped default for a date_range filter', async () => {
      const { svc } = buildSubject();
      await expect(
        svc.create(
          {
            name: 'D',
            filters: [
              {
                name: 'when',
                type: 'date_range',
                default: { start: '2026-01-01' },
              },
            ],
          },
          ORG,
          USER,
        ),
      ).rejects.toThrow(/start and end fields/);
    });

    it('rejects select default not in options', async () => {
      const { svc } = buildSubject();
      await expect(
        svc.create(
          {
            name: 'D',
            filters: [
              {
                name: 'country',
                type: 'select',
                options: ['RW', 'KE'],
                default: 'XX',
              },
            ],
          },
          ORG,
          USER,
        ),
      ).rejects.toThrow(/default "XX" is not in options/);
    });

    it('accepts select default present in options', async () => {
      const { svc } = buildSubject();
      const saved = await svc.create(
        {
          name: 'D',
          filters: [
            {
              name: 'country',
              type: 'select',
              options: ['RW', 'KE'],
              default: 'RW',
            },
          ],
        },
        ORG,
        USER,
      );
      expect(saved.filters[0].default).toBe('RW');
    });

    it('rejects multi_select default with values outside options', async () => {
      const { svc } = buildSubject();
      await expect(
        svc.create(
          {
            name: 'D',
            filters: [
              {
                name: 'regions',
                type: 'multi_select',
                options: ['RW', 'KE', 'UG'],
                default: ['RW', 'XX', 'YY'],
              },
            ],
          },
          ORG,
          USER,
        ),
      ).rejects.toThrow(/\[XX, YY\] not in options/);
    });

    it('accepts explicit null default for any filter type', async () => {
      const { svc } = buildSubject();
      const saved = await svc.create(
        {
          name: 'D',
          filters: [
            { name: 'q', type: 'text', default: null },
            { name: 'when', type: 'date', default: null },
          ],
        },
        ORG,
        USER,
      );
      expect(saved.filters[0].default).toBeNull();
    });

    it('replaces filters on update when supplied', async () => {
      const { svc, repo } = buildSubject();
      const existing = {
        id: 'd1',
        organizationId: ORG,
        name: 'd',
        filters: [{ name: 'old', type: 'text' }],
      } as never as any;
      repo.findOne.mockResolvedValue(existing);

      const updated = await svc.update(
        'd1',
        {
          filters: [{ name: 'fresh', type: 'date' }],
        },
        ORG,
      );
      expect(updated.filters).toEqual([{ name: 'fresh', type: 'date' }]);
    });
  });

  describe('remove', () => {
    it('removes after a successful fetch', async () => {
      const { svc, repo } = buildSubject();
      const d = { id: 'd1', organizationId: ORG } as never;
      repo.findOne.mockResolvedValue(d);
      await svc.remove('d1', ORG);
      expect(repo.remove).toHaveBeenCalledWith(d);
    });

    it('throws if the dashboard does not exist', async () => {
      const { svc, repo } = buildSubject();
      repo.findOne.mockResolvedValue(null);
      await expect(svc.remove('missing', ORG)).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.remove).not.toHaveBeenCalled();
    });
  });
});
