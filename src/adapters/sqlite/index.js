// @flow

import { NativeModules } from 'react-native'
import { connectionTag, type ConnectionTag, logger } from '../../utils/common'

import type Model, { RecordId } from '../../Model'
import type Query from '../../Query'
import type { TableName, AppSchema } from '../../Schema'
import type { DatabaseAdapter, CachedQueryResult, CachedFindResult, BatchOperation } from '../type'
import {
  type DirtyFindResult,
  type DirtyQueryResult,
  sanitizeFindResult,
  sanitizeQueryResult,
  devLogFind,
  devLogQuery,
  devLogCount,
  devLogBatch,
  devLogSetUp,
} from '../common'

import encodeQuery from './encodeQuery'
import encodeUpdate from './encodeUpdate'
import encodeInsert from './encodeInsert'
import encodeSchema from './encodeSchema'

export type SQL = string
export type SQLiteArg = string | boolean | number | null
export type SQLiteQuery = [SQL, SQLiteArg[]]

type NativeBridgeBatchOperation =
  | ['execute', SQL, SQLiteArg[]]
  | ['create', RecordId, SQL, SQLiteArg[]]
  | ['markAsDeleted', TableName<any>, RecordId]
  | ['destroyPermanently', TableName<any>, RecordId]
// | ['setLocal', string, string]
// | ['removeLocal', string]

type NativeBridgeType = {
  setUp: (ConnectionTag, string, SQL, number) => Promise<void>,
  find: (ConnectionTag, TableName<any>, RecordId) => Promise<DirtyFindResult>,
  query: (ConnectionTag, SQL) => Promise<DirtyQueryResult>,
  count: (ConnectionTag, SQL) => Promise<number>,
  batch: (ConnectionTag, NativeBridgeBatchOperation[]) => Promise<void>,
  getDeletedRecords: (ConnectionTag, TableName<any>) => Promise<RecordId[]>,
  destroyDeletedRecords: (ConnectionTag, TableName<any>, RecordId[]) => Promise<void>,
  unsafeResetDatabase: ConnectionTag => Promise<void>,
  getLocal: (ConnectionTag, string) => Promise<?string>,
  setLocal: (ConnectionTag, string, string) => Promise<void>,
  removeLocal: (ConnectionTag, string) => Promise<void>,
  unsafeClearCachedRecords: ConnectionTag => Promise<void>,
}
const Native: NativeBridgeType = NativeModules.DatabaseBridge

export type SQLiteAdapterOptions = $Exact<{
  dbName: string,
  schema: AppSchema,
}>

export default class SQLiteAdapter implements DatabaseAdapter {
  schema: AppSchema

  _tag: ConnectionTag = connectionTag()

  constructor(options: SQLiteAdapterOptions): void {
    this._setUp(options)
  }

  async _setUp({ dbName, schema }: SQLiteAdapterOptions): Promise<void> {
    this.schema = schema
    const schemaSQL = encodeSchema(schema)
    await devLogSetUp(() => Native.setUp(this._tag, dbName, schemaSQL, schema.version))
  }

  async find(table: TableName<any>, id: RecordId): Promise<CachedFindResult> {
    return devLogFind(
      async () =>
        sanitizeFindResult(await Native.find(this._tag, table, id), this.schema.tables[table]),
      table,
      id,
    )
  }

  async query<T: Model>(query: Query<T>): Promise<CachedQueryResult> {
    return devLogQuery(
      async () =>
        sanitizeQueryResult(
          await Native.query(this._tag, encodeQuery(query)),
          this.schema.tables[query.table],
        ),
      query,
    )
  }

  async count<T: Model>(query: Query<T>): Promise<number> {
    return devLogCount(() => Native.count(this._tag, encodeQuery(query, true)), query)
  }

  async batch(operations: BatchOperation[]): Promise<void> {
    await devLogBatch(async () => {
      await Native.batch(
        this._tag,
        operations.map(([type, record]) => {
          switch (type) {
            case 'create':
              return ['create', record.id, ...encodeInsert(record)]
            case 'markAsDeleted':
              return ['markAsDeleted', record.table, record.id]
            case 'destroyPermanently':
              return ['destroyPermanently', record.table, record.id]
            default:
              // case 'update':
              return ['execute', ...encodeUpdate(record)]
          }
        }),
      )
    }, operations)
  }

  getDeletedRecords(table: TableName<any>): Promise<RecordId[]> {
    return Native.getDeletedRecords(this._tag, table)
  }

  destroyDeletedRecords(table: TableName<any>, recordIds: RecordId[]): Promise<void> {
    return Native.destroyDeletedRecords(this._tag, table, recordIds)
  }

  async unsafeResetDatabase(): Promise<void> {
    await Native.unsafeResetDatabase(this._tag)
    logger.log('[DB] Database is now reset')
  }

  getLocal(key: string): Promise<?string> {
    return Native.getLocal(this._tag, key)
  }

  setLocal(key: string, value: string): Promise<void> {
    return Native.setLocal(this._tag, key, value)
  }

  removeLocal(key: string): Promise<void> {
    return Native.removeLocal(this._tag, key)
  }

  unsafeClearCachedRecords(): Promise<void> {
    return Native.unsafeClearCachedRecords(this._tag)
  }
}
