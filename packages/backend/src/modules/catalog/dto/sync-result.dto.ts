export class SyncCategories {
  connections: number = 0;
  tables: number = 0;
  pipelines: number = 0;
  lineage: number = 0;
  queries: number = 0;
}

export class SyncResult {
  synced: number = 0;
  errors: string[] = [];
  categories: SyncCategories = new SyncCategories();

  add(other: Partial<SyncResult>): void {
    this.synced += other.synced ?? 0;
    if (other.errors) this.errors.push(...other.errors);
    if (other.categories) {
      for (const key of Object.keys(other.categories) as Array<keyof SyncCategories>) {
        this.categories[key] = (this.categories[key] ?? 0) + (other.categories[key] ?? 0);
      }
    }
  }
}
