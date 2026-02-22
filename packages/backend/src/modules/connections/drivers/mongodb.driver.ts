import { MongoClient, Db } from 'mongodb';
import {
  DatabaseDriver,
  ConnectionConfig,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  QueryResult,
} from './database-driver.interface';

/**
 * MongoDB driver.
 *
 * Query format (JSON string):
 *   Find:        {"collection":"users","filter":{"age":{"$gt":18}},"limit":100}
 *   Projection:  {"collection":"orders","filter":{},"projection":{"_id":0},"limit":50}
 *   Aggregate:   {"collection":"sales","pipeline":[{"$group":{"_id":"$region","total":{"$sum":"$amount"}}}]}
 *
 * If `host` starts with "mongodb://" or "mongodb+srv://", it is used as-is as
 * the full connection string (Atlas / custom URI support).
 */
export class MongoDBDriver implements DatabaseDriver {
  private client: MongoClient | null = null;
  private db: Db | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    const uri = this.buildUri(config);

    try {
      this.client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      });
      await this.client.connect();
      this.db = this.client.db(config.database);
    } catch (error) {
      await this.disconnect();
      throw new Error(`MongoDB connection failed: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.db) throw new Error('Not connected');
    try {
      await this.db.command({ ping: 1 });
      return true;
    } catch {
      return false;
    }
  }

  async query(sql: string): Promise<QueryResult> {
    if (!this.db) throw new Error('Not connected');

    let queryDef: any;
    try {
      queryDef = JSON.parse(sql);
    } catch {
      throw new Error(
        'MongoDB queries must be valid JSON.\n' +
          'Find:      {"collection":"users","filter":{},"limit":100}\n' +
          'Aggregate: {"collection":"users","pipeline":[{"$match":{}}]}',
      );
    }

    if (!queryDef.collection) {
      throw new Error('Query JSON must include a "collection" field');
    }

    const coll = this.db.collection(queryDef.collection);
    const limit = Math.min(queryDef.limit ?? 1000, 10000);
    let docs: any[];

    if (queryDef.pipeline) {
      const pipeline: any[] = queryDef.pipeline;
      // Inject $limit as a safety guard if not already present
      const hasLimit = pipeline.some((s) => '$limit' in s);
      if (!hasLimit) pipeline.push({ $limit: limit });
      docs = await coll.aggregate(pipeline).toArray();
    } else {
      const filter = queryDef.filter ?? {};
      const projection = queryDef.projection ?? {};
      docs = await coll.find(filter, { projection }).limit(limit).toArray();
    }

    const fields =
      docs.length > 0
        ? Object.keys(docs[0]).map((key) => ({
            name: key,
            type: this.inferType(docs[0][key]),
          }))
        : [];

    return {
      rows: docs.map((doc) => this.serializeDoc(doc)),
      rowCount: docs.length,
      fields,
    };
  }

  async getSchemas(): Promise<SchemaInfo[]> {
    if (!this.client) throw new Error('Not connected');
    try {
      const admin = this.client.db('admin').admin();
      const { databases } = await admin.listDatabases();
      return databases
        .filter((d) => !['admin', 'local', 'config'].includes(d.name))
        .map((d) => ({ name: d.name }));
    } catch {
      // Insufficient privileges to list all DBs — return the connected DB only
      return [{ name: this.db!.databaseName }];
    }
  }

  async getTables(schema?: string): Promise<TableInfo[]> {
    if (!this.client) throw new Error('Not connected');
    const dbName = schema ?? this.db?.databaseName;
    if (!dbName) throw new Error('No database specified');

    const db = this.client.db(dbName);
    const collections = await db.listCollections().toArray();

    return collections.map((c) => ({
      schema: dbName,
      name: c.name,
      type: c.type === 'view' ? 'view' : 'table',
    }));
  }

  async getColumns(collection: string, schema?: string): Promise<ColumnInfo[]> {
    if (!this.client) throw new Error('Not connected');
    const dbName = schema ?? this.db?.databaseName;
    if (!dbName) throw new Error('No database specified');

    const db = this.client.db(dbName);
    // Sample up to 20 documents to infer the field set
    const docs = await db.collection(collection).find({}).limit(20).toArray();

    if (docs.length === 0) return [];

    // Union of all field names across sampled documents
    const fieldMap = new Map<string, string>();
    for (const doc of docs) {
      for (const [key, val] of Object.entries(doc)) {
        if (!fieldMap.has(key)) {
          fieldMap.set(key, this.inferType(val));
        }
      }
    }

    return Array.from(fieldMap.entries()).map(([name, type]) => ({
      name,
      type,
      nullable: true,
      defaultValue: null,
      isPrimaryKey: name === '_id',
    }));
  }

  private buildUri(config: ConnectionConfig): string {
    // If host is already a full URI, use it directly
    if (config.host.startsWith('mongodb://') || config.host.startsWith('mongodb+srv://')) {
      return config.host;
    }

    const creds =
      config.username && config.password
        ? `${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@`
        : '';

    const ssl = config.ssl ? '?tls=true&tlsAllowInvalidCertificates=true' : '';
    return `mongodb://${creds}${config.host}:${config.port}/${config.database}${ssl}`;
  }

  private inferType(value: any): string {
    if (value === null || value === undefined) return 'null';
    if (value?.constructor?.name === 'ObjectId') return 'objectid';
    if (value instanceof Date) return 'date';
    if (Buffer.isBuffer(value)) return 'binary';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return typeof value;
  }

  private serializeDoc(doc: any): any {
    if (doc === null || doc === undefined) return doc;
    if (doc?.constructor?.name === 'ObjectId') return doc.toString();
    if (doc instanceof Date) return doc.toISOString();
    if (Buffer.isBuffer(doc)) return doc.toString('base64');
    if (Array.isArray(doc)) return doc.map((v) => this.serializeDoc(v));
    if (typeof doc === 'object') {
      const out: any = {};
      for (const [k, v] of Object.entries(doc)) {
        out[k] = this.serializeDoc(v);
      }
      return out;
    }
    return doc;
  }
}
