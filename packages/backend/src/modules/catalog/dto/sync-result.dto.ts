export class SyncResult {
  created: number = 0;
  updated: number = 0;
  errors: string[] = [];

  add(other: Partial<SyncResult>): void {
    this.created += other.created ?? 0;
    this.updated += other.updated ?? 0;
    if (other.errors) this.errors.push(...other.errors);
  }
}
