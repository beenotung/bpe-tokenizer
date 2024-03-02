import DB, { BetterSqlite3Helper } from '@beenotung/better-sqlite3-helper'
import { DBProxy, Token, createProxy } from './proxy'
import { migrationSQL } from './migration'
import { BPETokenizerJSON, EOF } from '../core'

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

  /** @description used by getLastCorpusId() */
  protected select_last_corpus_id: { get(): number | null }

  /** @description used by applyMerge() */
  protected select_corpus_by_code: {
    all(bindings: { code: string }): { id: number; content_code: string }[]
  }

  /** @description used by toJSON() */
  protected select_token_table: {
    all(): { chars: string; original_weight: number }[]
  }

  /** @description used by toJSON() */
  protected select_merge: {
    all(): { a_code: string; b_code: string; original_weight: number }[]
  }

  /** @description used by compactVectorIndex() */
  protected select_weighted_token: {
    all(): number[]
  }

  /** @description used by applyMerge() */
  protected update_corpus: {
    run(bindings: { id: number; content_code: string }): void
  }

  /**
   * @description for encode
   * @description vector_index skip zero-weight tokens
   * */
  to_vector_index: number[] | null = null

  /**
   * @description for decode
   * @description vector_index skip zero-weight tokens
   * */
  from_vector_index: number[] | null = null

  constructor(options: { db: BetterSqlite3Helper.DBInstance }) {
    let { db } = options
    db.migrate({ migrations: [migrationSQL] })
    this.db = db
    this.proxy = createProxy({ db })
    this.char_to_token = {}
    this.code_to_token = {}
    this.merge_codes = []

    this.select_last_corpus_id = db
      .prepare(/* sql */ `select max(id) from corpus`)
      .pluck() as { get(): any }

    this.select_corpus_by_code = db.prepare(/* sql */ `
      select id, content_code from corpus
      where content_code like :code
      `) as { all(): any[] }

    this.select_token_table = db.prepare(/* sql */ `
      select chars, original_weight
      from char_token
      inner join token on token.id = char_token.id
      order by token.id asc
      `) as { all(): any[] }

    this.select_merge = db.prepare(/* sql */ `
      select
        a.code as a_code
      , b.code as b_code
      , c.original_weight
      from merge
      inner join token a on a.id = merge.a_id
      inner join token b on b.id = merge.b_id
      inner join token c on c.id = merge.c_id
      order by merge.id asc
      `) as { all(): any[] }

    this.select_weighted_token = db
      .prepare(
        /* sql */ `
      select id from token
      where weight > 0
      order by id asc
      `,
      )
      .pluck() as { all(): any[] }

    this.update_corpus = db.prepare(/* sql */ `
      update corpus
      set content_code = :content_code
      where id = :id
      `)

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
    this.toJSON = db.transaction(this.toJSON)
    this.fromJSON = db.transaction(this.fromJSON)
  }

  /** @description delete all tokens and corpus from database */
  reset() {
    let { db } = this
    resetBPETokenizerDB(db)
    let that = new BPETokenizerDB({ db })
    Object.assign(this, that)
  }

  /** @description for in-memory BPETokenizer */
  toJSON(): BPETokenizerJSON {
    debugger
    return {
      version: 1,
      token_table: this.select_token_table
        .all()
        .map(token => [token.chars, token.original_weight]),
      merge_codes: this.select_merge.all().map(merge => {
        let a_code = String.fromCodePoint(merge.a_code.codePointAt(0)! - 1)
        let b_code = String.fromCodePoint(merge.b_code.codePointAt(0)! - 1)
        return [a_code, b_code, merge.original_weight]
      }),
    }
  }

  /** @description delete all existing tokens and corpus, then import tokens from the json */
  fromJSON(json: BPETokenizerJSON) {
    if (
      json.version !== 1 ||
      !Array.isArray(json.token_table) ||
      !Array.isArray(json.merge_codes)
    )
      throw new Error('invalid format')
    this.reset()
    let { db, proxy, code_to_token } = this
    let { token: token_table, char_token, merge } = proxy
    let token_id = 0
    for (let [char, weight] of json.token_table) {
      token_id++
      let code = String.fromCodePoint(token_id)
      let token: Token = {
        chars: char,
        weight,
        original_weight: weight,
        code,
        id: token_id,
      }
      token_table[token_id] = token
      char_token[token_id] = { id: token_id }
      code_to_token[code] = token
    }
    for (let [a_code, b_code, c_weight] of json.merge_codes) {
      a_code = String.fromCodePoint(a_code.codePointAt(0)! + 1)
      b_code = String.fromCodePoint(b_code.codePointAt(0)! + 1)
      token_id++
      let code = String.fromCodePoint(token_id)
      let a = code_to_token[a_code]
      let b = code_to_token[b_code]
      let c: Token = {
        chars: a.chars + b.chars,
        weight: c_weight,
        original_weight: c_weight,
        code,
        id: token_id,
      }
      token_table[token_id] = c
      merge.push({ a_id: a.id!, b_id: b.id!, c_id: c.id! })
      code_to_token[code] = c
    }
    let that = new BPETokenizerDB({ db })
    Object.assign(this, that)
  }

  /** @description to enable adding more corpus without duplication */
  getLastCorpusId(): number | null {
    return this.select_last_corpus_id.get() as number
  }

  hasCorpus(id: number): boolean {
    return id in this.proxy.corpus
  }

  /**
   * @description add new content to corpus.
   * Token weights are updated when adding content.
   */
  addToCorpus(id: number, content: string) {
    let { proxy, char_to_token, code_to_token } = this
    let { token: token_table, char_token, corpus } = proxy
    if (id in corpus) {
      throw new Error('corpus already added to database')
    }
    let content_code = ''
    for (let char of EOF + content + EOF) {
      let token = char_to_token[char]
      if (!token) {
        let id = token_table.length + 1
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
        code_to_token[code] = token
      } else {
        token.weight++
        token.original_weight++
      }
      content_code += token.code
    }
    proxy.corpus[id] = { id, content_code }
  }

  /**
   * @description restore content to corpus (after import tokens with fromJSON()) for continuous merging.
   * Token weights are not updated when restoring content.
   */
  restoreToCorpus(id: number, content: string) {
    let { proxy } = this
    let content_code = this.encodeToCode(content)
    proxy.corpus[id] = { id, content_code }
  }

  protected invalidateVectorIndex() {
    this.to_vector_index = null
    this.from_vector_index = null
  }

  /**
   * @description skip zero-weight tokens to reduce range of vector index.
   * Auto called by `encodeToVector()` and `decodeVector()`
   */
  compactVectorIndex() {
    let { proxy } = this
    let { token: token_table } = proxy
    let token_count = token_table.length
    if (token_count == 0) {
      throw new Error(
        `token table is empty, have you called tokenizer.addToCorpus()?`,
      )
    }
    let to_vector_index: number[] = (this.to_vector_index = [])
    let from_vector_index: number[] = (this.from_vector_index = [])
    let vector_index = 0
    for (let id of this.select_weighted_token.all()) {
      to_vector_index[id] = vector_index
      from_vector_index[vector_index] = id
      vector_index++
    }
  }

  /**
   * @description called by `mergeUntil()`.
   * Can be used to implement custom iteration conditions.
   */
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

    let new_id = proxy.token.length + 1
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

  /**
   * @description called by `mergeUntil()`.
   * Can be used to implement custom iteration conditions.
   */
  applyMerge(merge: MergeToken) {
    let { proxy, code_to_token, merge_codes, update_corpus } = this
    let [a, b, c] = merge

    if (!c.id) {
      throw new Error('missing id in token c')
    }

    let from_code = a.code + b.code
    let to_code = c.code

    a.weight -= c.weight
    b.weight -= c.weight

    if (a.weight == 0 || b.weight == 0) {
      this.invalidateVectorIndex()
    }

    proxy.token[c.id!] = c
    c = proxy.token[c.id!]

    code_to_token[c.code] = c

    proxy.merge.push({ a_id: a.id!, b_id: b.id!, c_id: c.id! })
    merge_codes.push([from_code, to_code])

    let corpus_rows = this.select_corpus_by_code.all({
      code: `%${from_code}%`,
    })
    if (corpus_rows.length == 0) {
      for (let corpus of proxy.corpus) {
        if (corpus.content_code.includes(from_code)) {
          corpus_rows.push({
            id: corpus.id!,
            content_code: corpus.content_code,
          })
        }
      }
      if (corpus_rows.length == 0) {
        throw new Error('no matched corpus found')
      }
    }
    for (let corpus of corpus_rows) {
      corpus.content_code = corpus.content_code.replaceAll(from_code, to_code)
      update_corpus.run(corpus)
    }
  }

  /**
   * @description call `findNextMerge()` and `applyMerge()` in loop
   */
  mergeUntil(options?: {
    /** @default 2 */
    min_weight?: number
    /** @default unlimited */
    max_iterations?: number
  }) {
    let min_weight = options?.min_weight || 2
    let max_iterations = options?.max_iterations
    for (
      let iteration = 1;
      !max_iterations || iteration <= max_iterations;
      iteration++
    ) {
      let merge = this.findNextMerge()
      if (!merge) break
      let [_a, _b, c] = merge
      if (c.weight < min_weight) break
      this.applyMerge(merge)
    }
  }

  /**
   * @description encode to internal representation.
   * Used by:
   *   - `restoreToCorpus()`
   *   - `encodeToTokens()`
   *   - `encodeToVector()`
   */
  encodeToCode(content: string): string {
    let { char_to_token } = this

    let content_in_code = ''
    for (let char of content) {
      let token = char_to_token[char]
      if (!token) {
        throw new Error('unknown token, char: ' + JSON.stringify(char))
      }
      content_in_code += token.code
    }

    for (let [from_code, to_code] of this.merge_codes) {
      content_in_code = content_in_code.replaceAll(from_code, to_code)
    }

    return content_in_code
  }

  encodeToTokens(content: string): Token[] {
    let { code_to_token } = this

    let content_in_code = this.encodeToCode(content)

    let tokens: Token[] = []
    for (let code of content_in_code) {
      tokens.push(code_to_token[code])
    }

    return tokens
  }

  encodeToVector(content: string): number[] {
    let { code_to_token, to_vector_index } = this

    if (!to_vector_index) {
      this.compactVectorIndex()
      to_vector_index = this.to_vector_index!
    }

    let content_in_code = this.encodeToCode(content)

    let vector: number[] = []
    for (let code of content_in_code) {
      let id = code_to_token[code].id!
      if (id in to_vector_index) {
        vector.push(to_vector_index[id])
      } else {
        throw new Error(`unknown token id: ${id}`)
      }
    }

    return vector
  }

  decodeTokens(tokens: Token[]): string {
    let content = ''
    for (let token of tokens) {
      content += token.chars
    }
    return content
  }

  decodeVector(vector: number[]): string {
    let { proxy, from_vector_index } = this
    let { token: token_table } = proxy
    if (!from_vector_index) {
      this.compactVectorIndex()
      from_vector_index = this.from_vector_index!
    }
    let content = ''
    for (let vector_index of vector) {
      if (vector_index in from_vector_index) {
        let index = from_vector_index[vector_index]
        content += token_table[index].chars
      } else {
        throw new Error(`unknown vector index: ${vector_index}`)
      }
    }
    return content
  }
}

export function resetBPETokenizerDB(db: BetterSqlite3Helper.DBInstance) {
  db.migrate({ migrations: [migrationSQL] })
  let proxy = createProxy({ db })
  proxy.char_token.length = 0
  proxy.merge.length = 0
  proxy.corpus.length = 0
  proxy.token.length = 0
}

export function connectDB(path: string) {
  return DB({
    path,
    migrate: false,
  })
}
