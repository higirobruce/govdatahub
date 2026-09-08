import { MigrationInterface, QueryRunner } from 'typeorm';
import { createHash } from 'crypto';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const looksHashed = (v: string | null) => !!v && /^[0-9a-f]{64}$/.test(v);

export class HashDatasetShareTokens1711000000007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: { id: string; api_key: string | null; share_token: string | null }[] =
      await queryRunner.query(`SELECT id, api_key, share_token FROM dataset_shares`);

    for (const row of rows) {
      const apiKey =
        row.api_key && !looksHashed(row.api_key) ? sha256(row.api_key) : row.api_key;
      const shareToken =
        row.share_token && !looksHashed(row.share_token)
          ? sha256(row.share_token)
          : row.share_token;
      if (apiKey !== row.api_key || shareToken !== row.share_token) {
        await queryRunner.query(
          `UPDATE dataset_shares SET api_key = $1, share_token = $2 WHERE id = $3`,
          [apiKey, shareToken, row.id],
        );
      }
    }
  }

  public async down(): Promise<void> {
    throw new Error(
      'Irreversible: plaintext tokens cannot be recovered from hashes. Regenerate keys instead.',
    );
  }
}
