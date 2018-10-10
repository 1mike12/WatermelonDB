import { createTable, addColumns, schemaMigrations } from './index'
import { stepsForMigration } from './helpers'

describe('schemaMigrations()', () => {
  it('returns a basic schema migrations spec', () => {
    const migrations = schemaMigrations({ migrations: [] })
    expect(migrations).toEqual({
      sortedMigrations: [],
      validated: true,
      minVersion: 1,
      maxVersion: 1,
    })

    const migrations2 = schemaMigrations({ migrations: [{ version: 2, steps: [] }] })
    expect(migrations2).toEqual({
      validated: true,
      minVersion: 1,
      maxVersion: 2,
      sortedMigrations: [{ version: 2, steps: [] }],
    })

    const migrations3 = schemaMigrations({ migrations: [{ version: 4, steps: [] }] })
    expect(migrations3).toEqual({
      validated: true,
      minVersion: 3,
      maxVersion: 4,
      sortedMigrations: [{ version: 4, steps: [] }],
    })
  })
  it('returns a complex schema migrations spec', () => {
    const migrations = schemaMigrations({
      migrations: [
        { version: 4, steps: [] },
        {
          version: 3,
          steps: [
            createTable({
              name: 'comments',
              columns: [
                { name: 'post_id', type: 'string', isIndexed: true },
                { name: 'body', type: 'string' },
              ],
            }),
            addColumns({
              table: 'posts',
              columns: [{ name: 'author_id', type: 'string', isIndexed: true }],
            }),
          ],
        },
        {
          version: 2,
          steps: [
            addColumns({
              table: 'posts',
              columns: [
                { name: 'subtitle', type: 'string', isOptional: true },
                { name: 'is_pinned', type: 'boolean' },
              ],
            }),
          ],
        },
      ],
    })
    expect(migrations).toEqual({
      validated: true,
      minVersion: 1,
      maxVersion: 4,
      sortedMigrations: [
        {
          version: 2,
          steps: [
            {
              type: 'add_columns',
              table: 'posts',
              columns: [
                { name: 'subtitle', type: 'string', isOptional: true },
                { name: 'is_pinned', type: 'boolean' },
              ],
            },
          ],
        },
        {
          version: 3,
          steps: [
            {
              type: 'create_table',
              name: 'comments',
              columns: {
                post_id: { name: 'post_id', type: 'string', isIndexed: true },
                body: { name: 'body', type: 'string' },
              },
            },
            {
              type: 'add_columns',
              table: 'posts',
              columns: [{ name: 'author_id', type: 'string', isIndexed: true }],
            },
          ],
        },
        { version: 4, steps: [] },
      ],
    })
  })
  it('throws if migration spec is malformed', () => {
    expect(() => schemaMigrations({ migrations: [{}] })).toThrow(/Invalid migration/)
    expect(() => schemaMigrations({ migrations: [{ version: 0, steps: [] }] })).toThrow(
      /minimum.*is 2/i,
    )
    expect(() => schemaMigrations({ migrations: [{ version: 1, steps: [] }] })).toThrow(
      /minimum.*is 2/i,
    )
    expect(() =>
      schemaMigrations({
        migrations: [{ version: 2, steps: [{ table: 'x' }] }],
      }),
    ).toThrow(/Invalid migration steps/)
  })
  it(`throws if there are gaps in the migrable range or not listed in the right order`, () => {
    expect(() =>
      schemaMigrations({ migrations: [{ version: 2, steps: [] }, { version: 2, steps: [] }] }),
    ).toThrow(/in reverse chronological order/)
    expect(() =>
      schemaMigrations({ migrations: [{ version: 2, steps: [] }, { version: 3, steps: [] }] }),
    ).toThrow(/in reverse chronological order/)
    expect(() =>
      schemaMigrations({
        migrations: [
          { version: 5, steps: [] },
          { version: 4, steps: [] },
          { version: 2, steps: [] },
        ],
      }),
    ).toThrow(/in reverse chronological order/)

    // missing migrations from 2 to x are ok
    expect(() =>
      schemaMigrations({
        migrations: [
          { version: 6, steps: [] },
          { version: 5, steps: [] },
          { version: 4, steps: [] },
        ],
      }),
    ).not.toThrow()
  })
})

describe('migration step functions', () => {
  it('throws if createTable() is malformed', () => {
    expect(() => createTable({ columns: [] })).toThrow(/name/)
    expect(() => createTable({ name: 'foo', columns: [{ name: 'x', type: 'blah' }] })).toThrow(
      /type/,
    )
  })
  it('throws if addColumns() is malformed', () => {
    expect(() => addColumns({ columns: [{}] })).toThrow(/table/)
    expect(() => addColumns({ table: 'foo' })).toThrow(/columns/)
    expect(() => addColumns({ table: 'foo', columns: { name: 'x', type: 'blah' } })).toThrow(
      /columns/,
    )
    expect(() => addColumns({ table: 'foo', columns: [{ name: 'x', type: 'blah' }] })).toThrow(
      /type/,
    )
  })
})

describe('migration execution helpers', () => {
  it('finds the right migration steps', () => {
    const step1 = addColumns({
      table: 'posts',
      columns: [
        { name: 'subtitle', type: 'string', isOptional: true },
        { name: 'is_pinned', type: 'boolean' },
      ],
    })
    const step2 = addColumns({
      table: 'posts',
      columns: [{ name: 'author_id', type: 'string', isIndexed: true }],
    })
    const step3 = createTable({
      name: 'comments',
      columns: [
        { name: 'post_id', type: 'string', isIndexed: true },
        { name: 'body', type: 'string' },
      ],
    })

    const migrations = schemaMigrations({
      migrations: [
        { version: 5, steps: [step2, step3] },
        { version: 4, steps: [] },
        { version: 3, steps: [step1] },
      ],
    })

    expect(stepsForMigration({ migrations, fromVersion: 2, toVersion: 3 })).toEqual([step1])
    expect(stepsForMigration({ migrations, fromVersion: 2, toVersion: 4 })).toEqual([step1])
    expect(stepsForMigration({ migrations, fromVersion: 2, toVersion: 5 })).toEqual([
      step1,
      step2,
      step3,
    ])
    expect(stepsForMigration({ migrations, fromVersion: 3, toVersion: 5 })).toEqual([step2, step3])
    expect(stepsForMigration({ migrations, fromVersion: 3, toVersion: 4 })).toEqual([])
    expect(stepsForMigration({ migrations, fromVersion: 4, toVersion: 5 })).toEqual([step2, step3])

    // if no available steps, return null
    expect(
      stepsForMigration({
        migrations: schemaMigrations({ migrations: [] }),
        fromVersion: 1,
        toVersion: 2,
      }),
    ).toEqual(null)
    expect(stepsForMigration({ migrations, fromVersion: 1, toVersion: 2 })).toEqual(null)
    expect(stepsForMigration({ migrations, fromVersion: 1, toVersion: 3 })).toEqual(null)
    expect(stepsForMigration({ migrations, fromVersion: 1, toVersion: 5 })).toEqual(null)
    expect(stepsForMigration({ migrations, fromVersion: 3, toVersion: 6 })).toEqual(null)
    expect(stepsForMigration({ migrations, fromVersion: 5, toVersion: 6 })).toEqual(null)
  })
})
