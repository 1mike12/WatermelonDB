// @flow
import React from 'react'
import Database from '../Database'

const { Provider, Consumer } = React.createContext({})

export type Props = {
  database: Database,
  children: React$Element<any>,
}

/**
 * Database provider to create the database context
 * to allow child components to consume the database without prop drilling
 */
function DatabaseProvider({ children, database }: Props): React$Element<any> {
  if (!database) {
    throw new Error('You must supply a database prop to the DatabaseProvider')
  }
  return <Provider value={database}>{children}</Provider>
}

export { Consumer as DatabaseConsumer }
export { default as withDatabase } from './withDatabase'
export default DatabaseProvider
