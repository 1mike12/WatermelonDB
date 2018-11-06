import { expectToRejectWithMessage } from '../__tests__/utils'
import {
  mockDatabase,
  MockProject,
  MockTask,
  MockComment,
  testSchema,
} from '../__tests__/testModels'
import { CollectionChangeTypes } from '../Collection/common'
import Database from './index'

describe('watermelondb/Database', () => {
  it('implements collectionMap', () => {
    const database = new Database({
      adapter: { schema: null },
      modelClasses: [MockProject, MockTask, MockComment],
    })
    const projects = database.collections.get('mock_projects')
    const tasks = database.collections.get('mock_tasks')
    expect(projects.modelClass).toBe(MockProject)
    expect(projects.table).toBe('mock_projects')
    expect(tasks.modelClass).toBe(MockTask)
    expect(database.collections.get('non_existent')).toBeUndefined()
  })
  it('can batch records', async () => {
    let { database, tasksCollection: collection } = mockDatabase()
    const adapterBatchSpy = jest.spyOn(database.adapter, 'batch')

    const m1 = await collection.create()
    const m2 = await collection.create()

    const collectionObserver = jest.fn()
    collection.changes.subscribe(collectionObserver)

    const m3 = collection.prepareCreate()
    const m4 = collection.prepareCreate()

    const recordObserver = jest.fn()
    m1.observe().subscribe(recordObserver)

    const batchPromise = database.batch(
      m3,
      m1.prepareUpdate(() => {
        m1.name = 'bar1'
      }),
      m4,
      m2.prepareUpdate(() => {
        m2.name = 'baz1'
      }),
    )

    expect(m1._hasPendingUpdate).toBe(false)
    expect(m2._hasPendingUpdate).toBe(false)

    await batchPromise

    expect(adapterBatchSpy).toHaveBeenCalledTimes(3)
    expect(adapterBatchSpy).lastCalledWith([
      ['create', m3],
      ['update', m1],
      ['create', m4],
      ['update', m2],
    ])

    expect(collectionObserver).toHaveBeenCalledTimes(4)
    expect(collectionObserver).toBeCalledWith([{ record: m1, type: CollectionChangeTypes.updated }])
    expect(collectionObserver).toBeCalledWith([{ record: m2, type: CollectionChangeTypes.updated }])

    const createdRecords = [m3, m4]
    createdRecords.forEach(record => {
      expect(record._isCommitted).toBe(true)
      expect(collection._cache.get(record.id)).toBe(record)
      expect(collectionObserver).toBeCalledWith([{ record, type: CollectionChangeTypes.created }])
    })

    expect(recordObserver).toHaveBeenCalledTimes(2)

    // simulate reload -- check if changes actually got saved
    database = new Database({
      adapter: database.adapter.testClone(),
      schema: testSchema,
      modelClasses: [MockTask],
    })
    collection = database.collections.get('mock_tasks')

    const fetchedM1 = await collection.find(m1.id)
    const fetchedM2 = await collection.find(m2.id)
    expect(fetchedM1.name).toBe('bar1')
    expect(fetchedM2.name).toBe('baz1')
  })
  it('throws error if attempting to batch records without a pending operation', async () => {
    const { database, tasksCollection: collection } = mockDatabase()
    const m1 = await collection.create()

    expectToRejectWithMessage(
      database.batch(m1),
      /doesn't have a prepared create or prepared update/,
    )
  })
  it('implements withChangesForTables', async () => {
    const { database, projectsCollection, tasksCollection, commentsCollection } = mockDatabase()

    const observer = jest.fn()
    database.withChangesForTables(['mock_projects', 'mock_tasks']).subscribe(observer)

    expect(observer).toHaveBeenCalledTimes(1)

    await projectsCollection.create()
    const m1 = await projectsCollection.create()
    const m2 = await tasksCollection.create()
    const m3 = await commentsCollection.create()

    expect(observer).toHaveBeenCalledTimes(4)
    expect(observer).toBeCalledWith([{ record: m1, type: CollectionChangeTypes.created }])
    expect(observer).lastCalledWith([{ record: m2, type: CollectionChangeTypes.created }])

    await m1.update()
    await m2.update()
    await m3.update()

    expect(observer).toHaveBeenCalledTimes(6)
    expect(observer).lastCalledWith([{ record: m2, type: CollectionChangeTypes.updated }])

    await m1.destroyPermanently()
    await m2.destroyPermanently()
    await m3.destroyPermanently()

    expect(observer).toHaveBeenCalledTimes(8)
    expect(observer).toBeCalledWith([{ record: m1, type: CollectionChangeTypes.destroyed }])
    expect(observer).lastCalledWith([{ record: m2, type: CollectionChangeTypes.destroyed }])
  })
})

const delayPromise = () => new Promise(resolve => setTimeout(resolve, 100))

describe('Database actions', () => {
  it('can execute an action', async () => {
    const { database } = mockDatabase()

    const action = jest.fn()
    await database.action(action)

    expect(action).toHaveBeenCalledTimes(1)
  })
  it('queues actions', async () => {
    const { database } = mockDatabase()

    const actions = [jest.fn(delayPromise), jest.fn(delayPromise), jest.fn(delayPromise)]

    const promise0 = database.action(actions[0])
    database.action(actions[1])

    expect(actions[0]).toHaveBeenCalledTimes(1)
    expect(actions[1]).toHaveBeenCalledTimes(0)

    await promise0
    const promise2 = database.action(actions[2])

    expect(actions[0]).toHaveBeenCalledTimes(1)
    expect(actions[1]).toHaveBeenCalledTimes(1)
    expect(actions[2]).toHaveBeenCalledTimes(0)

    await promise2

    expect(actions[0]).toHaveBeenCalledTimes(1)
    expect(actions[1]).toHaveBeenCalledTimes(1)
    expect(actions[2]).toHaveBeenCalledTimes(1)

    // after queue is empty I can queue again and have result immediately
    const action3 = jest.fn()
    database.action(action3)
    expect(action3).toHaveBeenCalledTimes(1)
  })
  it('returns value from action', async () => {
    const { database } = mockDatabase()
    const result = await database.action(async () => 42)
    expect(result).toBe(42)
  })
  it('passes error from action', async () => {
    const { database } = mockDatabase()
    await expectToRejectWithMessage(
      database.action(async () => {
        throw new Error('test error')
      }),
      'test error',
    )
  })
  it.only('queues actions correctly even if some error out', async () => {
    const { database } = mockDatabase()

    const actions = [
      () => true,
      async () => {
        throw new Error('error1') // async error
      },
      async () => {
        await delayPromise()
        return 42
      },
      () => {
        throw new Error('error2') // sync error
      },
      () => delayPromise(),
    ]
    const promises = actions.map(action =>
      database.action(action).then(
        // jest will automatically fail the test if a promise rejects even though we're testing it later
        value => ['value', value],
        error => ['error', error],
      ),
    )
    await promises[4]

    // after queue is empty I can queue again
    const action5 = jest.fn()
    database.action(action5)
    expect(action5).toHaveBeenCalledTimes(1)

    // check if right answers
    expect(await promises[0]).toEqual(['value', true])
    expect(await promises[1]).toMatchObject(['error', { message: 'error1' }])
    expect(await promises[2]).toEqual(['value', 42])
    expect(await promises[3]).toMatchObject(['error', { message: 'error2' }])
  })
})
