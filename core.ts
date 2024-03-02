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

/**
 * @description replace a into b
 */
export type MergeCode = [a: string, b: string]

export let EOF = String.fromCharCode(4)

export class BPETokenizer {
  /** @description index for lookup */
  char_to_token: Record<string, Token> = {}

  /** @description index for lookup */
  code_to_token: Record<string, Token> = {}

  /** @description token.index -> Token */
  token_table: Token[] = []

  /** @description for export */
  merge_tokens: MergeToken[] = []

  /** @description for encode */
  merge_codes: MergeCode[] = []

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

  /** @description added by this.addToCorpus() */
  corpus_in_code: string[] = []

  toJSON() {
    let { merge_tokens } = this
    let token_table: [chars: string, weight: number][] = []
    token_loop: for (let token of this.token_table) {
      let char_count = 0
      for (let _char of token.chars) {
        char_count++
        if (char_count > 1) break token_loop
      }
      token_table.push([token.chars, token.original_weight])
    }
    return {
      version: 1,
      token_table,
      merge_codes: merge_tokens.map(
        ([a, b, c]) => [a.code, b.code, c.original_weight] as const,
      ),
    }
  }

  protected invalidateVectorIndex() {
    this.to_vector_index = null
    this.from_vector_index = null
  }

  fromJSON(json: ReturnType<BPETokenizer['toJSON']>) {
    if (
      json.version !== 1 ||
      !Array.isArray(json.token_table) ||
      !Array.isArray(json.merge_codes)
    )
      throw new Error('invalid format')
    let newInstance = new BPETokenizer()
    let {
      char_to_token,
      code_to_token,
      token_table,
      merge_tokens,
      merge_codes,
    } = newInstance
    Object.assign(this, newInstance)
    for (let [char, weight] of json.token_table) {
      let index = token_table.length
      let code = String.fromCodePoint(index)
      let token: Token = {
        chars: char,
        weight,
        original_weight: weight,
        code,
        index,
      }
      char_to_token[char] = token
      code_to_token[code] = token
      token_table[index] = token
    }
    for (let [a_code, b_code, c_weight] of json.merge_codes) {
      let a: Token = code_to_token[a_code]
      let b: Token = code_to_token[b_code]
      let new_index = token_table.length
      let new_code = String.fromCodePoint(new_index)
      let c: Token = {
        chars: a.chars + b.chars,
        weight: c_weight,
        original_weight: c_weight,
        code: new_code,
        index: new_index,
      }
      a.weight -= c_weight
      b.weight -= c_weight
      char_to_token[c.chars] = c
      code_to_token[c.code] = c
      token_table[c.index] = c
      merge_tokens.push([a, b, c])
      merge_codes.push([a.code + b.code, c.code])
    }
    this.compactVectorIndex()
  }

  /**
   * @description add new content to corpus.
   * Token weights are updated when adding content.
   */
  addToCorpus(content: string) {
    let { char_to_token, code_to_token, token_table } = this
    let sample_in_code = ''
    for (let char of EOF + content + EOF) {
      let token = char_to_token[char]
      if (!token) {
        let index = token_table.length
        let code = String.fromCodePoint(index)
        token = {
          chars: char,
          weight: 1,
          original_weight: 1,
          code: code,
          index,
        }
        char_to_token[char] = token
        code_to_token[code] = token
        token_table.push(token)
      } else {
        token.weight++
        token.original_weight++
      }
      sample_in_code += token.code
    }
    this.corpus_in_code.push(sample_in_code)
  }

  /**
   * @description restore content to corpus (after restart) for continuous merging.
   * Token weights are not updated when restoring content.
   */
  restoreToCorpus(content: string) {
    let content_in_code = this.encodeToCode(content)
    this.corpus_in_code.push(content_in_code)
  }

  /**
   * @description skip zero-weight tokens to reduce range of vector index.
   * Auto called by `encodeToVector()` and `decodeVector()`
   */
  compactVectorIndex() {
    let { token_table } = this
    let token_count = token_table.length
    if (token_count == 0) {
      throw new Error(
        `token table is empty, have you called tokenizer.addToCorpus()?`,
      )
    }
    let to_vector_index: number[] = (this.to_vector_index = [])
    let from_vector_index: number[] = (this.from_vector_index = [])
    let vector_index = 0
    for (let index = 0; index < token_count; index++) {
      let token = token_table[index]
      if (token.weight > 0) {
        to_vector_index[index] = vector_index
        from_vector_index[vector_index] = index
        vector_index++
      }
    }
  }

  /**
   * @description called by `mergeUntil()`.
   * Can be used to implement custom iteration conditions.
   */
  findNextMerge(): MergeToken | null {
    let { code_to_token } = this

    // a -> b -> count
    let a_b_c_weights = new Map<Token, Map<Token, number>>()
    let max_a: Token | null = null
    let max_b: Token | null = null
    let max_c_index: number | null = null
    let max_c_weight: number | null = null

    for (let sample_in_code of this.corpus_in_code) {
      let last_a: Token | null = null
      let a: Token | null = null
      for (let code of sample_in_code) {
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
          let c_index = a.index + b.index

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

    let new_index = this.token_table.length
    let new_code = String.fromCodePoint(new_index)
    let max_c: Token = {
      chars: max_a!.chars + max_b!.chars,
      weight: max_c_weight,
      original_weight: max_c_weight,
      code: new_code,
      index: new_index,
    }

    return [max_a!, max_b!, max_c]
  }

  /**
   * @description called by `mergeUntil()`.
   * Can be used to implement custom iteration conditions.
   */
  applyMerge(merge: MergeToken) {
    let {
      code_to_token,
      token_table,
      merge_tokens,
      merge_codes,
      corpus_in_code,
    } = this
    let [a, b, c] = merge

    let from_code = a.code + b.code
    let to_code = c.code

    a.weight -= c.weight
    b.weight -= c.weight
    if (a.weight == 0 || b.weight == 0) {
      this.invalidateVectorIndex()
    }

    code_to_token[c.code] = c
    token_table.push(c)

    merge_tokens.push(merge)
    merge_codes.push([from_code, to_code])

    let corpus_count = corpus_in_code.length
    for (let i = 0; i < corpus_count; i++) {
      corpus_in_code[i] = corpus_in_code[i].replaceAll(from_code, to_code)
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
      let index = code_to_token[code].index
      if (index in to_vector_index) {
        vector.push(to_vector_index[index])
      } else {
        throw new Error(`unknown token index: ${index}`)
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
    let { from_vector_index, token_table } = this
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

  /**
   * @description restore merge produced from `compactMerge(this.findNextMerge())`.
   * To be used after restart for continuous merging.
   */
  restoreMerge(compactMerge: CompactMerge) {
    let [a_code, b_code, c_weight] = compactMerge
    let a = this.code_to_token[a_code]
    if (!a) throw new Error(`unknown token, a_code: ${JSON.stringify(a_code)}`)
    let b = this.code_to_token[b_code]
    if (!a) throw new Error(`unknown token, b_code: ${JSON.stringify(b_code)}`)
    let index = this.token_table.length
    let code = String.fromCodePoint(index)
    let c: Token = {
      chars: a.chars + b.chars,
      weight: c_weight,
      original_weight: c_weight,
      code,
      index,
    }
    this.applyMerge([a, b, c])
  }
}

/**
 * @description to store MergeToken in compact format
 */
export function compactMerge(merge: MergeToken): CompactMerge {
  let [a, b, c] = merge
  return [a.code, b.code, c.weight]
}
