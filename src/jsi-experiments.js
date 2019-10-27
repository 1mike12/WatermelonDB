import { NativeModules } from 'react-native'

const { appSchema, tableSchema } = require('./Schema')

const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'test',
      columns: [
        { name: 'string', type: 'string' },
        { name: 'string2', type: 'string' },
        { name: 'string3', type: 'string' },
        { name: 'string4', type: 'string', isOptional: true },
        { name: 'string5', type: 'string' },
        { name: 'number', type: 'number' },
        { name: 'boolean', type: 'boolean' },
      ],
    }),
  ],
})

const { encodeSchema } = require('./adapters/sqlite/encodeSchema')

const encodedSchema = encodeSchema(schema)

const size = 30000
const dataToBatch = [...Array(size).keys()].map(x => [
  'create',
  'test',
  `id${x}`,
  'insert into test (id, string, string2, string3, string4, string5, number, boolean) values (?, ?, ?, ?, ?, ?, ?, ?)',
  [
    `id${x}`,
    'foo',
    'foo',
    'Lorem ipsum dolor sit amet enim. Etiam ullamcorper. Suspendisse a pellentesque dui, non felis. Maecenas malesuada elit lectus felis, malesuada ultricies. Curabitur et ligula. Ut molestie a, ultricies porta urna. Vestibulum commodo volutpat a, convallis ac, laoreet enim. Phasellus fermentum in, dolor. Pellentesque facilisis. Nulla imperdiet sit amet magna. Vestibulum dapibus, mauris nec malesuada fames ac turpis velit, rhoncus eu, luctus et interdum adipiscing wisi. Aliquam erat ac ipsum. Integer aliquam purus. Quisque lorem tortor fringilla sed, vestibulum id, eleifend justo vel bibendum sapien massa ac turpis faucibus orci luctus non, consectetuer lobortis quis, varius in, purus. Integer ultrices posuere cubilia Curae, Nulla ipsum dolor lacus, suscipit adipiscing. Cum sociis natoque penatibus et ultrices volutpat. Nullam wisi ultricies a, gravida vitae, dapibus risus ante sodales lectus blandit eu, tempor diam pede cursus vitae, ultricies eu, faucibus quis, porttitor eros cursus lectus, pellentesque eget, bibendum a, gravida ullamcorper quam. Nullam viverra consectetuer. Quisque cursus et, porttitor risus. Aliquam sem. In hendrerit nulla quam nunc, accumsan congue. Lorem ipsum primis in nibh vel risus. Sed vel lectus. Ut sagittis, ipsum dolor quam.',
    null,
    'foo',
    3.14,
    1,
  ],
])

async function runTests() {
  const dbname = 'file:jsitests?mode=memory&cache=shared'
  await NativeModules.DatabaseBridge.initialize(0, dbname, 1)
  await NativeModules.DatabaseBridge.setUpWithSchema(0, dbname, encodedSchema, 1)

  console.log(encodedSchema)

  await new Promise(resolve => setTimeout(resolve, 500))

  console.log(`Hello!`)
  const before = Date.now()
  global.nativeWatermelonBatch(dataToBatch)
  console.log(`NEw method - added ${size} in ${Date.now() - before}ms`)

  await new Promise(resolve => setTimeout(resolve, 500))
  if (
    (await NativeModules.DatabaseBridge.count(0, 'select count(*) as count from test')) !== size
  ) {
    throw new Error('bad module!')
  }

  // Compare performance with old method
  const dbname2 = 'file:jsitests2?mode=memory&cache=shared'
  await NativeModules.DatabaseBridge.initialize(1, dbname2, 1)
  await NativeModules.DatabaseBridge.setUpWithSchema(1, dbname2, encodedSchema, 1)

  await new Promise(resolve => setTimeout(resolve, 500))

  const beforeOld = Date.now()
  await NativeModules.DatabaseBridge.batch(1, dataToBatch)
  console.log(`Old method - added ${size} in ${Date.now() - beforeOld}ms`)

  await new Promise(resolve => setTimeout(resolve, 500))
  if (
    (await NativeModules.DatabaseBridge.count(1, 'select count(*) as count from test')) !== size
  ) {
    throw new Error('bad module!')
  }

  // Old method + JSON
  const dbname3 = 'file:jsitests2?mode=memory&cache=shared'
  await NativeModules.DatabaseBridge.initialize(2, dbname3, 2)
  await NativeModules.DatabaseBridge.setUpWithSchema(2, dbname3, encodedSchema, 2)

  await new Promise(resolve => setTimeout(resolve, 500))

  const beforeOld3 = Date.now()
  await NativeModules.DatabaseBridge.batchJSON(2, JSON.stringify(dataToBatch))
  console.log(`Old method JSON - added ${size} in ${Date.now() - beforeOld3}ms`)

  await new Promise(resolve => setTimeout(resolve, 500))
  if (
    (await NativeModules.DatabaseBridge.count(2, 'select count(*) as count from test')) !== size
  ) {
    throw new Error('bad module!')
  }
}

runTests()
