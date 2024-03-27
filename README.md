# BPE Tokenizer

Build your own vocabulary from application-specific corpus using [Byte pair encoding (BPE)](https://en.wikipedia.org/wiki/Byte_pair_encoding) algorithm.

[![npm Package Version](https://img.shields.io/npm/v/bpe-tokenizer)](https://www.npmjs.com/package/bpe-tokenizer)
[![Minified Package Size](https://img.shields.io/bundlephobia/min/bpe-tokenizer)](https://bundlephobia.com/package/bpe-tokenizer)
[![Minified and Gzipped Package Size](https://img.shields.io/bundlephobia/minzip/bpe-tokenizer)](https://bundlephobia.com/package/bpe-tokenizer)

## Background

This algorithm was first described in 1994 by Philip Gage for encoding strings of text into tabular form for use in downstream modeling. It was adopted by OpenAI to build GPT.

## Motivation

Instead of using an over sized vocabulary set from generic dataset, you can build a smaller vocabulary set tailored for your application.

## Package Overview

This package consists of two BPE tokenizers: in-memory `BPETokenizer` and sqlite-backed `BPETokenizerDB`.

The in-memory implementation can merge tokens in faster manner. The incremental merges can be persisted, which can be re-applied to resume merging progress after restart.

After the merging iteration is finished, the complete token table in the tokenizer and be persist and recovered after restart for encoding and decoding.

The sqlite-backed implementation store the characters and occurrences of each token in the database. The required tables are created automatically if not existing.

To facilitate applications built on-top of this package, the token table in `BPETokenizer` is a public property, and the tokens in `BPETokenizerDB` are accessible via typed proxy array.

The entity relation diagram (ERD) of BPETokenizerDB is documented in [erd.txt](./db/erd.txt).

## Features Highlight

- BPETokenizer
  - in-memory
  - zero-dependencies
  - cross-platform
    - works in both nodejs and browser
  - encode/decode to token
    - as token object
    - as vector (integer index of token)
    - as binary string (compact format)
  - faster at merging token than BPETokenizerDB
  - support continuos merging after restart
    - can export tokens and merges as json (to be persisted)
    - can resume from full snapshot or incremental merges
    - need to re-add content to corpus
- BPETokenizerDB
  - using sqlite as backend
  - works in nodejs (not in browser)
  - encode/decode to token
    - as token object (proxy to the row in database)
    - as vector (integer id of token)
    - as binary string (compact format)
  - auto create tables if not existing
  - support larger size of corpus than BPETokenizer
    - can handle corpus size larger than the RAM can hold
  - easy to obtain statistics on tokens
  - support import from snapshot exported from BPETokenizer
  - support continuos merging after restart
    - can resume merging without extra steps
    - do not need to re-add content to corpus
  - hot data are cached in memory
    - fast encoding / decoding

## Installation

```bash
npm install bpe-tokenizer
```

This package has two optional dependencies. They can be omitted when using `BPETokenizer`. You can check corresponding installation options from npm or pnpm to omit optional dependencies.

### Package Overview

```javascript
require('bpe-tokenizer')
{
  /* main class */
  BPETokenizer,

  /* constants */
  FS: '\x1C',
  EOF: '\x04',
  LF: '\n',
  CR: '\r',

  /* helper functions */
  fileContentToCorpus,
  linesToCorpus,
  linesTrimmedToCorpus,
  compactMerge,
}

require('bpe-tokenizer/db')
{
  /* main class */
  BPETokenizerDB,

  /* helper functions */
  resetBPETokenizerDB,
  connectDB,
}
```

## Usage Example

```typescript
import { BPETokenizer } from 'bpe-tokenizer'
import fs from 'fs'

let tokenizer = new BPETokenizer()

let content = 'aaabdaaabac'

// you can add this method multiple times to add more samples from application-specific corpus
tokenizer.addToCorpus(content)

// you can set a higher threshold for the minimum number of occurrences
tokenizer.mergeUntil({ min_weight: 2 })

// persist the tokenizer, you can restore it with tokenizer.fromJSON()
fs.writeFileSync('tokenizer.json', JSON.stringify(tokenizer))

// encode into object array for extended usage
let tokens = tokenizer.encodeToTokens(content)

// encode into integer array for numeric operations
let vector = tokenizer.encodeToVector(content)

// you can decode from token or vector
let decoded_content = tokenizer.decodeTokens(tokens)
decoded_content = tokenizer.decodeVector(vector)

console.log({
  content: content.length,
  vector: vector.length,
  ratio: vector.length / content.length,
  segments: tokens.map(token => token.chars),
  match: content == decoded_content,
})
```

More usage examples see [core-test.ts](./core-test.ts) and the [example](./example/) folder.

## Typescript Signature

<details>
<summary>(click to expand)

Type signatures of `BPETokenizer`, helper functions, types and constants in `bpe-tokenizer`:

</summary>

The main class `BPETokenizer`:

```typescript
export class BPETokenizer {
  /** @description token.index -> Token */
  token_table: Token[]

  /**
   * @description export token tables and merge list.
   * The json can be used to restore after restart, or to populate database with BPETokenizerDB.
   */
  toJSON(): BPETokenizerJSON

  /** @description restore from json (after restart) */
  fromJSON(json: BPETokenizerJSON): void

  /**
   * @description add new content to corpus.
   * Token weights are updated when adding content.
   */
  addToCorpus(content: string): void

  /**
   * @description called by `mergeUntil()`.
   * Can be used to implement custom iteration conditions.
   */
  findNextMerge(options?: {
    /** @default 2 */
    min_weight?: number
    /** @default unlimited */
    max_length?: number
  }): MergeToken | null
  /**
   * @description called by `mergeUntil()`.
   * Can be used to implement custom iteration conditions.
   */
  applyMerge(merge: MergeToken): void

  /**
   * @description call `findNextMerge()` and `applyMerge()` in loop
   */
  mergeUntil(options?: {
    /** @default 2 */
    min_weight?: number
    /** @default unlimited */
    max_length?: number
    /** @default unlimited */
    max_iterations?: number
  }): void

  encodeToTokens(content: string): Token[]
  encodeToVector(content: string): number[]

  decodeTokens(tokens: Token[]): string
  decodeVector(vector: number[]): string

  /* for restore */

  /**
   * @description restore content to corpus (after restart) for continuous merging.
   * Token weights are not updated when restoring content.
   */
  restoreToCorpus(content: string): void

  /**
   * @description restore merge produced from `compactMerge(this.findNextMerge())`.
   * To be used after restart for continuous merging.
   */
  restoreMerge(compactMerge: CompactMerge): void

  /* internal methods */

  /**
   * @description encode to binary string.
   * Used by:
   *   - `restoreToCorpus()`
   *   - `encodeToTokens()`
   *   - `encodeToVector()`
   */
  encodeToCode(content: string): string
}
```

Object Types:

```typescript
/**
 * @description a + b -> c, e.g. "app" + "le" -> "apple"
 */
export type MergeToken = [a: Token, b: Token, c: Token]

/**
 * @description to be stored to file for restoring
 */
export type CompactMerge = [a_code: string, b_code: string, c_weight: number]

/** @description for BPETokenizer.fromJSON() */
export type BPETokenizerJSON = {
  version: 2
  char_count: number
  token_table: [chars: string, weight: number, original_weight: number][]
  merge_codes: [a_code: string, b_code: string, c_code: string][]
}
```

Helper functions:

```typescript
/** @description wrap with FS and EOF */
export function fileContentToCorpus(content: string | Buffer): string

/** @description split into lines, wrap with \r and \n */
export function linesToCorpus(text: string): string[]

/** @description split into lines, trim spaces, wrap with \r and \n */
export function linesTrimmedToCorpus(text: string): string[]

/**
 * @description to store MergeToken in compact format
 */
export function compactMerge(merge: MergeToken): CompactMerge

export type Token = {
  chars: string
  /** @description the weight after merge */
  weight: number
  /** @description the weight before merge */
  original_weight: number
  code: string
  /** @description including zero-weight tokens in token_table */
  index: number
}
```

Constants:

```typescript
/** @description file separator */
export let FS: string

/** @description end of file */
export let EOF: string

/** @description "\n" line feed, new line */
export let LF: string

/** @description "\r" carriage return */
export let CR: string
```

</details>

<details>
<summary>(click to expand)

Type signatures of `BPETokenizerDB`, helper functions, and object types in `bpe-tokenizer/db`:

</summary>

The main class `BPETokenizerDB`:

```typescript
import { BetterSqlite3Helper } from '@beenotung/better-sqlite3-helper'
import { DBProxy, Token } from './proxy'
import { BPETokenizerJSON } from '../core'

export class BPETokenizerDB {
  db: BetterSqlite3Helper.DBInstance
  proxy: DBProxy

  constructor(options: { db: BetterSqlite3Helper.DBInstance })

  /** @description delete all tokens and corpus from database, called by fromJSON() */
  reset(): void

  /** @description for in-memory BPETokenizer */
  toJSON(): BPETokenizerJSON

  /** @description delete all existing tokens and corpus, then import tokens from the json */
  fromJSON(json: BPETokenizerJSON): void

  /** @description to enable adding more corpus without duplication */
  getLastCorpusId(): number | null

  hasCorpus(id: number): boolean

  /**
   * @description add new content to corpus.
   * Token weights are updated when adding content.
   */
  addToCorpus(id: number, content: string): void

  /**
   * @description restore content to corpus (after import tokens with fromJSON()) for continuous merging.
   * Token weights are not updated when restoring content.
   */
  restoreToCorpus(id: number, content: string): void

  /**
   * @description called by `mergeUntil()`.
   * Can be used to implement custom iteration conditions.
   */
  findNextMerge(options?: {
    /** @default 2 */
    min_weight?: number
    /** @default unlimited */
    max_length?: number
  }): MergeToken | null

  /**
   * @description called by `mergeUntil()`.
   * Can be used to implement custom iteration conditions.
   */
  applyMerge(merge: MergeToken): void

  /**
   * @description call `findNextMerge()` and `applyMerge()` in loop
   */
  mergeUntil(options?: {
    /** @default 2 */
    min_weight?: number
    /** @default unlimited */
    max_length?: number
    /** @default unlimited */
    max_iterations?: number
  }): void

  encodeToTokens(content: string): Token[]
  encodeToVector(content: string): number[]

  decodeTokens(tokens: Token[]): string
  decodeVector(vector: number[]): string

  /**
   * @description encode to binary string.
   * Used by:
   *   - `restoreToCorpus()`
   *   - `encodeToTokens()`
   *   - `encodeToVector()`
   */
  encodeToCode(content: string): string
}
```

Object Types:

```typescript
/**
 * @description a + b -> c, e.g. "app" + "le" -> "apple"
 */
export type MergeToken = [a: Token, b: Token, c: Token]
```

Helper functions:

```typescript
export function connectDB(path: string): BetterSqlite3Helper.DBInstance

export function resetBPETokenizerDB(db: BetterSqlite3Helper.DBInstance): void
```

</details>

<details>
<summary>(click to expand)

Type signatures of the tables in `bpe-tokenizer/db/proxy`:

</summary>

```typescript
import { BetterSqlite3Helper } from '@beenotung/better-sqlite3-helper'
import { ProxySchemaOptions } from 'better-sqlite3-proxy'

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

export let tableFields: ProxySchemaOptions<DBProxy>['tableFields']

export function createProxy(options: {
  db: BetterSqlite3Helper.DBInstance
  auto_update_timestamp?: boolean | undefined
}): DBProxy
```

</details>

## License

This project is licensed with [BSD-2-Clause](./LICENSE)

This is free, libre, and open-source software. It comes down to four essential freedoms [[ref]](https://seirdy.one/2021/01/27/whatsapp-and-the-domestication-of-users.html#fnref:2):

- The freedom to run the program as you wish, for any purpose
- The freedom to study how the program works, and change it so it does your computing as you wish
- The freedom to redistribute copies so you can help others
- The freedom to distribute copies of your modified versions to others
