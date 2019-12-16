// @flow

export type Result<T> = $Exact<{ value: T }> | $Exact<{ error: Error }>
export type ResultCallback<T> = (Result<T>) => void

export function toPromise<T>(withCallback: (ResultCallback<T>) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    withCallback(result => {
      if (result.error) {
        reject(result.error)
      }

      // $FlowFixMe - yes, you do have a value
      resolve(result.value)
    })
  })
}
