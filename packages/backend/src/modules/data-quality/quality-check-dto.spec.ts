import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateQualityCheckDto, UpdateQualityCheckDto } from './quality-checks.service';

describe('Quality check DTO validation (COR-03)', () => {
  it('accepts a valid create payload (all properties whitelisted)', async () => {
    const dto = plainToInstance(CreateQualityCheckDto, {
      connectionId: 'c-1',
      schemaName: 'public',
      tableName: 'customers',
      name: 'not-null email',
      checkType: 'not_null',
      config: { column: 'email' },
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).toHaveLength(0);
  });

  it('rejects a create payload missing required fields', async () => {
    const dto = plainToInstance(CreateQualityCheckDto, { name: 'x' });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects unknown properties on update', async () => {
    const dto = plainToInstance(UpdateQualityCheckDto, { hacker: true });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThan(0);
  });
});
