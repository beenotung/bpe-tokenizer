import { proxySchema, ProxySchemaOptions } from 'better-sqlite3-proxy'

export type Corpus = {
  id?: null | number
  content_code: string
}

export type Token = {
  id?: null | number
  chars: string
  weight: number
  original_weight: number
  code: string
}

export type CharToken = {
  id?: null | number
  token?: Token
}

export type Merge = {
  id?: null | number
  a_id: number
  a?: Token
  b_id: number
  b?: Token
  c_id: number
  c?: Token
}

export type DBProxy = {
  corpus: Corpus[]
  token: Token[]
  char_token: CharToken[]
  merge: Merge[]
}

export let tableFields: ProxySchemaOptions<DBProxy>['tableFields'] = {
    corpus: [],
    token: [],
    char_token: [
      /* foreign references */
      ['token', { field: 'id', table: 'token' }],
    ],
    merge: [
      /* foreign references */
      ['a', { field: 'a_id', table: 'token' }],
      ['b', { field: 'b_id', table: 'token' }],
      ['c', { field: 'c_id', table: 'token' }],
    ],
}

export function createProxy(
  options: Omit<ProxySchemaOptions<DBProxy>, 'tableFields'>,
) {
  return proxySchema<DBProxy>({
    tableFields,
    ...options,
  })
}
