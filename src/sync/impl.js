// @flow

import {
  // $FlowFixMe
  promiseAllObject,
  map,
  reduce,
  contains,
  values,
  pipe,
  filter,
  find,
  equals,
  // $FlowFixMe
  piped,
} from 'rambdax'
import { allPromises, unnest } from '../utils/fp'
import { logError, invariant } from '../utils/common'
import type { Database, RecordId, Collection, Model, TableName, DirtyRaw } from '..'
import * as Q from '../QueryDescription'
import { columnName } from '../Schema'

import { prepareMarkAsSynced, prepareCreateFromRaw, prepareUpdateFromRaw } from './syncHelpers'
import type { SyncTableChangeSet, SyncDatabaseChangeSet, Timestamp } from './index'

export type SyncLocalChanges = $Exact<{ changes: SyncDatabaseChangeSet, affectedRecords: Model[] }>

const lastSyncedAtKey = '__watermelon_last_pulled_at'

export async function getLastPulledAt(database: Database): Promise<?Timestamp> {
  return parseInt(await database.adapter.getLocal(lastSyncedAtKey), 10) || null
}

export async function setLastPulledAt(database: Database, timestamp: Timestamp): Promise<void> {
  await database.adapter.setLocal(lastSyncedAtKey, `${timestamp}`)
}

export function ensureActionsEnabled(database: Database): void {
  invariant(
    database._actionsEnabled,
    '[Sync] To use Sync, Actions must be enabled. Pass `{ actionsEnabled: true }` to Database constructor — see docs for more details',
  )
}

// *** Applying remote changes ***

const getIds = map(({ id }) => id)
const idsForChanges = ({ created, updated, deleted }: SyncTableChangeSet): RecordId[] => [
  ...getIds(created),
  ...getIds(updated),
  ...deleted,
]
const queryForChanges = changes => Q.where(columnName('id'), Q.oneOf(idsForChanges(changes)))

const findRecord = <T: Model>(id: RecordId, list: T[]) => find(record => record.id === id, list)

type RecordsToApplyRemoteChangesTo<T: Model> = {
  ...SyncTableChangeSet,
  records: T[],
  recordsToDestroy: T[],
  locallyDeletedIds: RecordId[],
  deletedRecordsToDestroy: RecordId[],
}
async function recordsToApplyRemoteChangesTo<T: Model>(
  collection: Collection<T>,
  changes: SyncTableChangeSet,
): Promise<RecordsToApplyRemoteChangesTo<T>> {
  const { database, table } = collection
  const { deleted: deletedIds } = changes

  const records = await collection.query(queryForChanges(changes)).fetch()
  const locallyDeletedIds = await database.adapter.getDeletedRecords(table)

  return {
    ...changes,
    records,
    locallyDeletedIds,
    recordsToDestroy: filter(record => contains(record.id, deletedIds), records),
    deletedRecordsToDestroy: filter(id => contains(id, deletedIds), locallyDeletedIds),
  }
}

function validateRemoteRaw(raw: DirtyRaw): void {
  invariant(
    raw && typeof raw === 'object' && 'id' in raw && !('_status' in raw || '_changed' in raw),
    `[Sync] Invalid raw record supplied to Sync. Records must be objects, must have an 'id' field, and must NOT have a '_status' or '_changed' fields`,
  )
}

function prepareApplyRemoteChangesToCollection<T: Model>(
  collection: Collection<T>,
  recordsToApply: RecordsToApplyRemoteChangesTo<T>,
): T[] {
  const { database, table } = collection
  const { created, updated, records, locallyDeletedIds } = recordsToApply

  // Insert and update records
  const recordsToInsert = map(raw => {
    validateRemoteRaw(raw)
    const currentRecord = findRecord(raw.id, records)
    if (currentRecord) {
      logError(
        `[Sync] Server wants client to create record ${table}#${
          raw.id
        }, but it already exists locally. This may suggest last sync partially executed, and then failed; or it could be a serious bug. Will update existing record instead.`,
      )
      return prepareUpdateFromRaw(currentRecord, raw)
    } else if (contains(raw.id, locallyDeletedIds)) {
      logError(
        `[Sync] Server wants client to create record ${table}#${
          raw.id
        }, but it already exists locally and is marked as deleted. This may suggest last sync partially executed, and then failed; or it could be a serious bug. Will delete local record and recreate it instead.`,
      )
      // Note: we're not awaiting the async operation (but it will always complete before the batch)
      database.adapter.destroyDeletedRecords(table, [raw.id])
      return prepareCreateFromRaw(collection, raw)
    }

    return prepareCreateFromRaw(collection, raw)
  }, created)

  const recordsToUpdate = map(raw => {
    validateRemoteRaw(raw)
    const currentRecord = findRecord(raw.id, records)

    if (currentRecord) {
      return prepareUpdateFromRaw(currentRecord, raw)
    } else if (contains(raw.id, locallyDeletedIds)) {
      // Nothing to do, record was locally deleted, deletion will be pushed later
      return null
    }

    // Record doesn't exist (but should) — just create it
    logError(
      `[Sync] Server wants client to update record ${table}#${
        raw.id
      }, but it doesn't exist locally. This could be a serious bug. Will create record instead.`,
    )

    return prepareCreateFromRaw(collection, raw)
  }, updated)

  // $FlowFixMe
  return [...recordsToInsert, ...filter(Boolean, recordsToUpdate)]
}

type AllRecordsToApply = { [TableName<any>]: RecordsToApplyRemoteChangesTo<Model> }

const getAllRecordsToApply = (
  db: Database,
  remoteChanges: SyncDatabaseChangeSet,
): AllRecordsToApply =>
  piped(
    remoteChanges,
    map((changes, tableName) =>
      recordsToApplyRemoteChangesTo(db.collections.get((tableName: any)), changes),
    ),
    promiseAllObject,
  )

const getAllRecordsToDestroy: AllRecordsToApply => Model[] = pipe(
  values,
  map(({ recordsToDestroy }) => recordsToDestroy),
  unnest,
)

const destroyAllDeletedRecords = (db: Database, recordsToApply: AllRecordsToApply) =>
  piped(
    recordsToApply,
    map(
      ({ deletedRecordsToDestroy }, tableName) =>
        deletedRecordsToDestroy.length &&
        db.adapter.destroyDeletedRecords((tableName: any), deletedRecordsToDestroy),
    ),
    promiseAllObject,
  )

const prepareApplyAllRemoteChanges = (db: Database, recordsToApply: AllRecordsToApply) =>
  piped(
    recordsToApply,
    map((records, tableName) =>
      prepareApplyRemoteChangesToCollection(db.collections.get((tableName: any)), records),
    ),
    values,
    unnest,
  )

const destroyPermanently = record => record.destroyPermanently()

export function applyRemoteChanges(
  db: Database,
  remoteChanges: SyncDatabaseChangeSet,
): Promise<void> {
  ensureActionsEnabled(db)
  return db.action(async () => {
    const recordsToApply = await getAllRecordsToApply(db, remoteChanges)

    // Perform steps concurrently
    await Promise.all([
      allPromises(destroyPermanently, getAllRecordsToDestroy(recordsToApply)),
      destroyAllDeletedRecords(db, recordsToApply),
      db.batch(...prepareApplyAllRemoteChanges(db, recordsToApply)),
    ])
  })
}

// *** Fetching local changes ***

const notSyncedQuery = Q.where(columnName('_status'), Q.notEq('synced'))
// TODO: It would be best to omit _status, _changed fields, since they're not necessary for the server
// but this complicates markLocalChangesAsDone, since we don't have the exact copy to compare if record changed
// TODO: It would probably also be good to only send to server locally changed fields, not full records
const rawsForStatus = (status, records) =>
  reduce(
    (raws, record) => (record._raw._status === status ? raws.concat({ ...record._raw }) : raws),
    [],
    records,
  )

async function fetchLocalChangesForCollection<T: Model>(
  collection: Collection<T>,
): Promise<[SyncTableChangeSet, T[]]> {
  const changedRecords = await collection.query(notSyncedQuery).fetch()
  const changeSet = {
    created: rawsForStatus('created', changedRecords),
    updated: rawsForStatus('updated', changedRecords),
    deleted: await collection.database.adapter.getDeletedRecords(collection.table),
  }
  return [changeSet, changedRecords]
}

const extractChanges = map(([changeSet]) => changeSet)
const extractAllAffectedRecords = pipe(
  values,
  map(([, records]) => records),
  unnest,
)

export function fetchLocalChanges(db: Database): Promise<SyncLocalChanges> {
  ensureActionsEnabled(db)
  return db.action(async () => {
    const changes = await promiseAllObject(
      map(
        fetchLocalChangesForCollection,
        // $FlowFixMe
        db.collections.map,
      ),
    )
    return {
      // $FlowFixMe
      changes: extractChanges(changes),
      affectedRecords: extractAllAffectedRecords(changes),
    }
  })
}

// *** Mark local changes as synced ***

const unchangedRecordsForRaws = (raws, recordCache) =>
  reduce(
    (records, raw) => {
      const record = recordCache.find(model => model.id === raw.id)
      if (!record) {
        logError(
          `[Sync] Looking for record ${
            raw.id
          } to mark it as synced, but I can't find it. Will ignore it (it should get synced next time). This is probably a Watermelon bug — please file an issue!`,
        )
        return records
      }

      // only include if it didn't change since fetch
      // TODO: get rid of `equals`
      return equals(record._raw, raw) ? records.concat(record) : records
    },
    [],
    raws,
  )

const recordsToMarkAsSynced = ({ changes, affectedRecords }: SyncLocalChanges): Model[] =>
  pipe(
    values,
    map(({ created, updated }) =>
      unchangedRecordsForRaws([...created, ...updated], affectedRecords),
    ),
    unnest,
  )(changes)

const destroyDeletedRecords = (db: Database, { changes }: SyncLocalChanges): Promise<*> =>
  promiseAllObject(
    map(
      ({ deleted }, tableName) => db.adapter.destroyDeletedRecords(tableName, deleted),
      // $FlowFixMe
      changes,
    ),
  )

export function markLocalChangesAsSynced(
  db: Database,
  syncedLocalChanges: SyncLocalChanges,
): Promise<void> {
  ensureActionsEnabled(db)
  return db.action(async () => {
    // update and destroy records concurrently
    await Promise.all([
      db.batch(...map(prepareMarkAsSynced, recordsToMarkAsSynced(syncedLocalChanges))),
      destroyDeletedRecords(db, syncedLocalChanges),
    ])
  })
}
