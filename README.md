# BPE Tokenizer

Build your own vocabulary from application-specific corpus using [Byte pair encoding (BPE)](https://en.wikipedia.org/wiki/Byte_pair_encoding) algorithm.

[![npm Package Version](https://img.shields.io/npm/v/bpe-tokenizer)](https://www.npmjs.com/package/bpe-tokenizer)
[![Minified Package Size](https://img.shields.io/bundlephobia/min/bpe-tokenizer)](https://bundlephobia.com/package/bpe-tokenizer)
[![Minified and Gzipped Package Size](https://img.shields.io/bundlephobia/minzip/bpe-tokenizer)](https://bundlephobia.com/package/bpe-tokenizer)

This algorithm was first described in 1994 by Philip Gage for encoding strings of text into tabular form for use in downstream modeling. It was adopted by OpenAI to build GPT.

Instead of using an over sized vocabulary set from generic dataset, you can build a smaller vocabulary set tailored for your application.

## Installation

```bash
npm install bpe-tokenizer
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

## Typescript Signature

```typescript
export class BPETokenizer {
  /** @description token.index -> Token */
  token_table: Token[]

  toJSON(): BPETokenizerJSON
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
  findNextMerge(): MergeToken | null
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
   * @description skip zero-weight tokens to reduce range of vector index.
   * Auto called by `encodeToVector()` and `decodeVector()`
   */
  compactVectorIndex(): void

  /**
   * @description encode to internal representation.
   * Used by:
   *   - `restoreToCorpus()`
   *   - `encodeToTokens()`
   *   - `encodeToVector()`
   */
  encodeToCode(content: string): string
}

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
  version: 1
  token_table: [chars: string, weight: number][]
  merge_codes: CompactMerge[]
}
```

## License

This project is licensed with [BSD-2-Clause](./LICENSE)

This is free, libre, and open-source software. It comes down to four essential freedoms [[ref]](https://seirdy.one/2021/01/27/whatsapp-and-the-domestication-of-users.html#fnref:2):

- The freedom to run the program as you wish, for any purpose
- The freedom to study how the program works, and change it so it does your computing as you wish
- The freedom to redistribute copies so you can help others
- The freedom to distribute copies of your modified versions to others
