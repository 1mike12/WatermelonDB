// @flow
/* eslint-disable global-require */

import { NativeModules } from 'react-native'
import { fromPairs } from 'rambdax'
import { connectionTag, type ConnectionTag, logger, invariant } from '../../utils/common'

import type { RecordId } from '../../Model'
import type { SerializedQuery } from '../../Query'
import type { TableName, AppSchema, SchemaVersion } from '../../Schema'
import type { SchemaMigrations, MigrationStep } from '../../Schema/migrations'
import type { DatabaseAdapter, CachedQueryResult, CachedFindResult, BatchOperation } from '../type'
import {
  type DirtyFindResult,
  type DirtyQueryResult,
  sanitizeFindResult,
  sanitizeQueryResult,
  devLogSetUp,
  validateAdapter,
} from '../common'

import encodeQuery from './encodeQuery'
import encodeUpdate from './encodeUpdate'
import encodeInsert from './encodeInsert'

export type SQL = string
export type SQLiteArg = string | boolean | number | null
export type SQLiteQuery = [SQL, SQLiteArg[]]

type NativeBridgeBatchOperation =
  | ['execute', TableName<any>, SQL, SQLiteArg[]]
  | ['create', TableName<any>, RecordId, SQL, SQLiteArg[]]
  | ['markAsDeleted', TableName<any>, RecordId]
  | ['destroyPermanently', TableName<any>, RecordId]
// | ['setLocal', string, string]
// | ['removeLocal', string]

type InitializeStatus =
  | { code: 'ok' | 'schema_needed' }
  | { code: 'migrations_needed', databaseVersion: SchemaVersion }

type SyncReturn<Result> =
  | { status: 'success', result: Result }
  | { status: 'error', code: string, message: string }

function getSyncReturn<Result>(syncReturn: SyncReturn<Result>): Result {
  if (syncReturn.status === 'success') {
    return syncReturn.result
  } else if (syncReturn.status === 'error') {
    const error = new Error(syncReturn.message)
    // $FlowFixMem
    error.code = syncReturn.code
    throw error
  } else {
    throw new Error('Unknown native bridge response')
  }
}

async function syncReturnToPromise<Result>(syncReturn: SyncReturn<Result>): Promise<Result> {
  return getSyncReturn(syncReturn)
}

type NativeDispatcher = $Exact<{
  initialize: (ConnectionTag, string, SchemaVersion) => Promise<InitializeStatus>,
  setUpWithSchema: (ConnectionTag, string, SQL, SchemaVersion) => Promise<void>,
  setUpWithMigrations: (ConnectionTag, string, SQL, SchemaVersion, SchemaVersion) => Promise<void>,
  find: (ConnectionTag, TableName<any>, RecordId) => Promise<DirtyFindResult>,
  query: (ConnectionTag, TableName<any>, SQL) => Promise<DirtyQueryResult>,
  count: (ConnectionTag, SQL) => Promise<number>,
  batch: (ConnectionTag, NativeBridgeBatchOperation[]) => Promise<void>,
  batchJSON?: (ConnectionTag, string) => Promise<void>,
  getDeletedRecords: (ConnectionTag, TableName<any>) => Promise<RecordId[]>,
  destroyDeletedRecords: (ConnectionTag, TableName<any>, RecordId[]) => Promise<void>,
  unsafeResetDatabase: (ConnectionTag, SQL, SchemaVersion) => Promise<void>,
  getLocal: (ConnectionTag, string) => Promise<?string>,
  setLocal: (ConnectionTag, string, string) => Promise<void>,
  removeLocal: (ConnectionTag, string) => Promise<void>,
}>

const dispatcherMethods = [
  'initialize',
  'setUpWithSchema',
  'setUpWithMigrations',
  'find',
  'query',
  'count',
  'batch',
  'batchJSON',
  'getDeletedRecords',
  'destroyDeletedRecords',
  'unsafeResetDatabase',
  'getLocal',
  'setLocal',
  'removeLocal',
]

type NativeBridgeType = {
  // Async methods
  ...NativeDispatcher,

  // Synchronous methods
  initializeSync?: (ConnectionTag, string, SchemaVersion) => SyncReturn<InitializeStatus>,
  setUpWithSchemaSync?: (ConnectionTag, string, SQL, SchemaVersion) => SyncReturn<void>,
  setUpWithMigrationsSync?: (
    ConnectionTag,
    string,
    SQL,
    SchemaVersion,
    SchemaVersion,
  ) => SyncReturn<void>,
  findSync?: (ConnectionTag, TableName<any>, RecordId) => SyncReturn<DirtyFindResult>,
  querySync?: (ConnectionTag, TableName<any>, SQL) => SyncReturn<DirtyQueryResult>,
  countSync?: (ConnectionTag, SQL) => SyncReturn<number>,
  batchSync?: (ConnectionTag, NativeBridgeBatchOperation[]) => SyncReturn<void>,
  batchJSONSync?: (ConnectionTag, string) => SyncReturn<void>,
  getDeletedRecordsSync?: (ConnectionTag, TableName<any>) => SyncReturn<RecordId[]>,
  destroyDeletedRecordsSync?: (ConnectionTag, TableName<any>, RecordId[]) => SyncReturn<void>,
  unsafeResetDatabaseSync?: (ConnectionTag, SQL, SchemaVersion) => SyncReturn<void>,
  getLocalSync?: (ConnectionTag, string) => SyncReturn<?string>,
  setLocalSync?: (ConnectionTag, string, string) => SyncReturn<void>,
  removeLocalSync?: (ConnectionTag, string) => SyncReturn<void>,
}

const NativeDatabaseBridge: NativeBridgeType = NativeModules.DatabaseBridge

const makeDispatcher = (isSynchronous: boolean): NativeDispatcher => {
  const methods = dispatcherMethods.map(methodName => {
    if (isSynchronous) {
      const syncName = `${methodName}Sync`
      return [methodName, () => syncReturnToPromise(NativeDatabaseBridge[syncName]())]
    }
    return [methodName, NativeDatabaseBridge[methodName]]
  })

  const dispatcher: any = fromPairs(methods)
  return dispatcher
}

export type SQLiteAdapterOptions = $Exact<{
  dbName?: string,
  schema: AppSchema,
  migrations?: SchemaMigrations,
  synchronous?: boolean,
}>

export default class SQLiteAdapter implements DatabaseAdapter {
  schema: AppSchema

  migrations: ?SchemaMigrations

  _tag: ConnectionTag = connectionTag()

  _dbName: string

  _synchronous: boolean

  _dispatcher: NativeDispatcher

  constructor(options: SQLiteAdapterOptions): void {
    const { dbName, schema, migrations } = options
    this.schema = schema
    this.migrations = migrations
    this._dbName = this._getName(dbName)
    this._synchronous = this._isSynchonous(options.synchronous)
    this._dispatcher = makeDispatcher(this._synchronous)

    if (process.env.NODE_ENV !== 'production') {
      invariant(
        // $FlowFixMe
        options.migrationsExperimental === undefined,
        'SQLiteAdapter migrationsExperimental has been renamed to migrations',
      )
      invariant(
        NativeDatabaseBridge,
        `NativeModules.DatabaseBridge is not defined! This means that you haven't properly linked WatermelonDB native module. Refer to docs for more details`,
      )
      validateAdapter(this)
    }

    devLogSetUp(() => this._init())
  }

  _isSynchonous(synchronous: ?boolean): boolean {
    if (synchronous && !NativeDatabaseBridge.initializeSync) {
      logger.warn(
        `Synchronous SQLiteAdapter not available… falling back to asynchronous operation. This will happen if you're using remote debugger, and may happen if you forgot to recompile native app after WatermelonDB update`,
      )
      return false
    }
    return synchronous || false
  }

  testClone(options?: $Shape<SQLiteAdapterOptions> = {}): SQLiteAdapter {
    return new SQLiteAdapter({
      dbName: this._dbName,
      schema: this.schema,
      synchronous: this._synchronous,
      ...(this.migrations ? { migrations: this.migrations } : {}),
      ...options,
    })
  }

  _getName(name: ?string): string {
    if (process.env.NODE_ENV === 'test') {
      return name || `file:testdb${this._tag}?mode=memory&cache=shared`
    }

    return name || 'watermelon'
  }

  async _init(): Promise<void> {
    // Try to initialize the database with just the schema number. If it matches the database,
    // we're good. If not, we try again, this time sending the compiled schema or a migration set
    // This is to speed up the launch (less to do and pass through bridge), and avoid repeating
    // migration logic inside native code
    const status = await this._dispatcher.initialize(this._tag, this._dbName, this.schema.version)

    if (status.code === 'schema_needed') {
      await this._setUpWithSchema()
    } else if (status.code === 'migrations_needed') {
      await this._setUpWithMigrations(status.databaseVersion)
    } else {
      invariant(status.code === 'ok', 'Invalid database initialization status')
    }
  }

  async _setUpWithMigrations(databaseVersion: SchemaVersion): Promise<void> {
    logger.log('[DB] Database needs migrations')
    invariant(databaseVersion > 0, 'Invalid database schema version')

    const migrationSteps = this._migrationSteps(databaseVersion)

    if (migrationSteps) {
      logger.log(`[DB] Migrating from version ${databaseVersion} to ${this.schema.version}...`)

      try {
        await this._dispatcher.setUpWithMigrations(
          this._tag,
          this._dbName,
          this._encodeMigrations(migrationSteps),
          databaseVersion,
          this.schema.version,
        )
        logger.log('[DB] Migration successful')
      } catch (error) {
        logger.error('[DB] Migration failed', error)
        throw error
      }
    } else {
      logger.warn(
        '[DB] Migrations not available for this version range, resetting database instead',
      )
      await this._setUpWithSchema()
    }
  }

  async _setUpWithSchema(): Promise<void> {
    logger.log(`[DB] Setting up database with schema version ${this.schema.version}`)
    await this._dispatcher.setUpWithSchema(
      this._tag,
      this._dbName,
      this._encodedSchema(),
      this.schema.version,
    )
    logger.log(`[DB] Schema set up successfully`)
  }

  async find(table: TableName<any>, id: RecordId): Promise<CachedFindResult> {
    return sanitizeFindResult(
      await this._dispatcher.find(this._tag, table, id),
      this.schema.tables[table],
    )
  }

  async query(query: SerializedQuery): Promise<CachedQueryResult> {
    const sql = encodeQuery(query)
    const tableSchema = this.schema.tables[query.table]
    return sanitizeQueryResult(
      await this._dispatcher.query(this._tag, query.table, sql),
      tableSchema,
    )
  }

  async count(query: SerializedQuery): Promise<number> {
    const sql = encodeQuery(query, true)
    return this._dispatcher.count(this._tag, sql)
  }

  async batch(operations: BatchOperation[]): Promise<void> {
    const batchOperations: NativeBridgeBatchOperation[] = operations.map(operation => {
      const [type, table, rawOrId] = operation
      switch (type) {
        case 'create': {
          // $FlowFixMe
          return ['create', table, rawOrId.id].concat(encodeInsert(table, rawOrId))
        }
        case 'update': {
          // $FlowFixMe
          return ['execute', table].concat(encodeUpdate(table, rawOrId))
        }
        case 'markAsDeleted':
        case 'destroyPermanently':
          // $FlowFixMe
          return operation // same format, no need to repack
        default:
          throw new Error('unknown batch operation type')
      }
    })
    const { batchJSON } = this._dispatcher
    if (batchJSON) {
      await batchJSON(this._tag, JSON.stringify(batchOperations))
    } else {
      await this._dispatcher.batch(this._tag, batchOperations)
    }
  }

  getDeletedRecords(table: TableName<any>): Promise<RecordId[]> {
    return this._dispatcher.getDeletedRecords(this._tag, table)
  }

  destroyDeletedRecords(table: TableName<any>, recordIds: RecordId[]): Promise<void> {
    return this._dispatcher.destroyDeletedRecords(this._tag, table, recordIds)
  }

  async unsafeResetDatabase(): Promise<void> {
    await this._dispatcher.unsafeResetDatabase(
      this._tag,
      this._encodedSchema(),
      this.schema.version,
    )
    logger.log('[DB] Database is now reset')
  }

  getLocal(key: string): Promise<?string> {
    return this._dispatcher.getLocal(this._tag, key)
  }

  setLocal(key: string, value: string): Promise<void> {
    return this._dispatcher.setLocal(this._tag, key, value)
  }

  removeLocal(key: string): Promise<void> {
    return this._dispatcher.removeLocal(this._tag, key)
  }

  _encodedSchema(): SQL {
    const { encodeSchema } = require('./encodeSchema')
    return encodeSchema(this.schema)
  }

  _migrationSteps(fromVersion: SchemaVersion): ?(MigrationStep[]) {
    const { stepsForMigration } = require('../../Schema/migrations/helpers')
    const { migrations } = this
    // TODO: Remove this after migrations are shipped
    if (!migrations) {
      return null
    }
    return stepsForMigration({
      migrations,
      fromVersion,
      toVersion: this.schema.version,
    })
  }

  _encodeMigrations(steps: MigrationStep[]): SQL {
    const { encodeMigrationSteps } = require('./encodeSchema')
    return encodeMigrationSteps(steps)
  }
}
