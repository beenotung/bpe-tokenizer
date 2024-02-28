export type Token = {
  chars: string
  /** @description the weight after merge */
  weight: number
  /** @description the weight before merge */
  original_weight: number
  code: string
  /** @description including zero-weight tokens */
  index: number
  /** @description excluding zero-weight tokens */
  vector_index: number | null
}

/**
 * @description a + b -> c, e.g. "app" + "le" -> "apple"
 */
export type MergeToken = [a: Token, b: Token, c: Token]

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

  /** @description token.vector_index -> Token */
  vector_index_to_token: Token[] = []

  /** @description for export */
  merge_tokens: MergeToken[] = []

  /** @description for encode */
  merge_codes: MergeCode[] = []

  /** @description added by this.addContent() */
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

  fromJSON(json: ReturnType<(typeof this)['toJSON']>) {
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
        vector_index: null,
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
        vector_index: null,
      }
      a.weight -= c_weight
      if (a != b) {
        b.weight -= c_weight
      }
      char_to_token[c.chars] = c
      code_to_token[c.code] = c
      token_table[c.index] = c
      merge_tokens.push([a, b, c])
      merge_codes.push([a.code + b.code, c.code])
    }
  }

  addContent(content: string) {
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
          vector_index: null,
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

  compactVectorIndex() {
    let { vector_index_to_token } = this
    let vector_index = 0
    vector_index_to_token.length = 0
    for (let token of this.token_table) {
      if (token.weight > 0) {
        token.vector_index = vector_index
        vector_index_to_token[vector_index] = token
        vector_index++
      }
    }
  }

  findNextMerge(): MergeToken | null {
    let { code_to_token } = this

    // a -> b -> c (a+b)
    let a_b_c_tokens = new Map<Token, Map<Token, Token>>()
    let max_a: Token | null = null
    let max_b: Token | null = null
    let max_c: Token | null = null
    let new_index = this.token_table.length
    let new_code = String.fromCodePoint(new_index)

    for (let sample_in_code of this.corpus_in_code) {
      let a: Token | null = null
      for (let code of sample_in_code) {
        let b = code_to_token[code]
        if (a) {
          let b_c_tokens = a_b_c_tokens.get(a)
          if (!b_c_tokens) {
            b_c_tokens = new Map()
            a_b_c_tokens.set(a, b_c_tokens)
          }

          let c = b_c_tokens.get(b)
          if (!c) {
            c = {
              chars: a.chars + b.chars,
              weight: 1,
              original_weight: 1,
              code: new_code,
              index: new_index,
              vector_index: null,
            }
            b_c_tokens.set(b, c)
          } else {
            c.weight++
          }

          if (!max_c || c.weight > max_c.weight) {
            max_a = a
            max_b = b
            max_c = c
          }
        }
        a = b
      }
    }

    if (!max_c) return null

    max_c.original_weight = max_c.weight

    return [max_a!, max_b!, max_c]
  }

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
    if (a != b) {
      b.weight -= c.weight
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

  mergeUntil(options?: { min_weight?: number }) {
    let min_weight = options?.min_weight || 2
    for (;;) {
      let merge = this.findNextMerge()
      if (!merge) break
      let [_a, _b, c] = merge
      if (c.weight < min_weight) break
      this.applyMerge(merge)
    }
  }

  protected encodeToCode(content: string): string {
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
    let { code_to_token } = this

    let content_in_code = this.encodeToCode(content)

    let vector: number[] = []
    for (let code of content_in_code) {
      let { vector_index } = code_to_token[code]
      if (!vector_index) {
        this.compactVectorIndex()
        vector_index = code_to_token[code].vector_index
        if (!vector_index) {
          throw new Error(
            'compactVectorIndex() not called before encoding or saving',
          )
        }
      }
      vector.push(vector_index)
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
    let { vector_index_to_token } = this
    let content = ''
    for (let index of vector) {
      content += vector_index_to_token[index].chars
    }
    return content
  }
}
