// @flow

import hasIn from '../utils/fp/hasIn'

import type Model from './index'

const hasCreatedAt = hasIn('createdAt')
export const hasUpdatedAt = hasIn('updatedAt')

export const createTimestampsFor = (model: Model) => {
  const date = Date.now()
  const timestamps = {}

  if (hasCreatedAt(model)) {
    timestamps.created_at = date
  }

  if (hasUpdatedAt(model)) {
    timestamps.updated_at = date
  }

  return timestamps
}

export async function fetchChildren(model: Model) {
  const associations = model.collection.modelClass.associations
  const childrenKeys = Object.keys(associations).filter(key => associations[key].type === 'has_many')
  
  const promises = childrenKeys.map(async key => {
    var children = await model[key].fetch()
    const promises = children.map(async child => {
      return await fetchChildren(child)
    })
    const results = await Promise.all(promises)
    results.forEach(res => children = children.concat(res))
    return children
  })

  const results = await Promise.all(promises)
  var allChildren = []
  results.forEach(res => allChildren = allChildren.concat(res))
  return allChildren
}
