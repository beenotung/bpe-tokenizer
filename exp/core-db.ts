import { BetterSqlite3Helper } from '@beenotung/better-sqlite3-helper'
import { DBProxy, Token, createProxy } from './proxy'
import BetterSqlite from 'better-sqlite3'
import { join } from 'path'

export let EOF = String.fromCharCode(4)

/**
 * @description a + b -> c, e.g. "app" + "le" -> "apple"
 */
export type MergeToken = [a: Token, b: Token, c: Token]

/**
 * @description replace a into b
 */
export type MergeCode = [a: string, b: string]

export class BPETokenizerDB {
  db: BetterSqlite3Helper.DBInstance
  proxy: DBProxy

  /** @description index for lookup */
  char_to_token: Record<string, Token>

  /** @description index for lookup */
  code_to_token: Record<string, Token>

  /** @description for encode */
  merge_codes: MergeCode[]

  /** @returns number | null */
  protected select_last_corpus_id: BetterSqlite.Statement

  constructor(options: { db: BetterSqlite3Helper.DBInstance }) {
    let { db } = options
    db.migrate({ migrationsPath: join(__dirname, 'migrations') })
    this.db = db
    this.proxy = createProxy({ db })
    this.char_to_token = {}
    this.code_to_token = {}
    this.merge_codes = []
    this.select_last_corpus_id = db
      .prepare(/* sql */ `select max(id) from corpus`)
      .pluck()
    let { proxy, char_to_token, code_to_token, merge_codes } = this
    for (let token of proxy.token) {
      if (token.id! in proxy.char_token) {
        char_to_token[token.chars] = token
      }
      code_to_token[token.code] = token
    }
    for (let merge of proxy.merge) {
      let from_code = merge.a!.code + merge.b!.code
      let to_code = merge.c!.code
      merge_codes.push([from_code, to_code])
    }

    this.addToCorpus = db.transaction(this.addToCorpus)
    this.findNextMerge = db.transaction(this.findNextMerge)
    this.applyMerge = db.transaction(this.applyMerge)
  }

  /** @description to enable adding more corpus without duplication */
  getLastCorpusExternalId(): number | null {
    return this.select_last_corpus_id.get() as number
  }

  hasCorpus(id: number): boolean {
    return id in this.proxy.corpus
  }

  addToCorpus(id: number, content: string) {
    let { proxy, char_to_token } = this
    let { token: token_table, char_token } = proxy
    let content_code = ''
    for (let char of EOF + content + EOF) {
      let token = char_to_token[char]
      if (!token) {
        let id = token_table.length
        let code = String.fromCodePoint(id)
        token = {
          chars: char,
          weight: 1,
          original_weight: 1,
          code: code,
        }
        token_table[id] = token
        char_token[id] = { id }
        token = token_table[id]
        char_to_token[char] = token
      } else {
        token.weight++
        token.original_weight++
      }
      content_code += token.code
    }
    proxy.corpus[id] = { id, content_code }
  }

  findNextMerge(): MergeToken | null {
    let { proxy, code_to_token } = this

    proxy.token

    // a -> b -> count
    let a_b_c_weights = new Map<Token, Map<Token, number>>()
    let max_a: Token | null = null
    let max_b: Token | null = null
    let max_c_index: number | null = null
    let max_c_weight: number | null = null

    for (let corpus of proxy.corpus) {
      let last_a: Token | null = null
      let a: Token | null = null
      for (let code of corpus.content_code) {
        let b = code_to_token[code]
        if (a) {
          let b_c_weights = a_b_c_weights.get(a)
          if (!b_c_weights) {
            b_c_weights = new Map()
            a_b_c_weights.set(a, b_c_weights)
          }

          let c_weight = b_c_weights.get(b)
          if (!c_weight) {
            b_c_weights.set(b, 1)
            c_weight = 1
          } else {
            // avoid counting "X X X" as two occurrences of "X X"
            if (a == b && last_a == a) {
              last_a = null
              a = b
              continue
            }
            c_weight++
            b_c_weights.set(b, c_weight)
          }
          let c_index = a.id! + b.id!

          if (
            !max_c_weight ||
            c_weight > max_c_weight ||
            (c_weight == max_c_weight && c_index < max_c_index!)
          ) {
            max_a = a
            max_b = b
            max_c_weight = c_weight
            max_c_index = c_index
          }
        }
        last_a = a
        a = b
      }
    }

    if (!max_c_weight) return null

    let new_id = proxy.token.length
    let new_code = String.fromCodePoint(new_id)
    let max_c: Token = {
      chars: max_a!.chars + max_b!.chars,
      weight: max_c_weight,
      original_weight: max_c_weight,
      code: new_code,
      id: new_id,
    }

    return [max_a!, max_b!, max_c]
  }

  applyMerge(merge: MergeToken) {
    let { proxy, code_to_token, merge_codes } = this
    let [a, b, c] = merge

    if (!c.id) {
      throw new Error('missing id in token c')
    }
    proxy.token[c.id!] = c
    c = proxy.token[c.id!]

    let from_code = a.code + b.code
    let to_code = c.code

    a.weight -= c.weight
    b.weight -= c.weight

    code_to_token[c.code] = c

    proxy.merge.push({ a_id: a.id!, b_id: b.id!, c_id: c.id! })
    merge_codes.push([from_code, to_code])

    for (let corpus of proxy.corpus) {
      let content = corpus.content_code
      let new_content = content.replaceAll(from_code, to_code)
      if (content.length != new_content.length) {
        corpus.content_code = new_content
      }
    }
  }
}
