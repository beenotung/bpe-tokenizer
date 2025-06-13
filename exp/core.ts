export type Token = {
  /** a substring of the corpus */
  chars: string
  /** the weight after merge */
  weight: number
  /** the weight before merge */
  original_weight: number
  /** encoded string of the word index */
  code: string
  /** index in the token_table */
  index: number
}

/** store token_table in parallel arrays for better space efficiency */
export type BPETokenizerJSON = {
  version: 'exp'
  chars: string[]
  weights: number[]
  original_weights: number[]
}

export class BPETokenizer {
  /** store all tokens */
  token_table: Token[] = []

  /** index to lookup token by char */
  char_to_token: Record<string, Token> = Object.create(null)

  /** index to lookup token by code (encoded index) */
  code_to_token: Record<string, Token> = Object.create(null)

  /** added by `addToCorpus()` */
  corpus_in_code: string[] = []

  addToCorpus(content: string) {
    let { token_table, char_to_token, code_to_token } = this
    let sample_in_code = ''
    for (let char of content) {
      let token = char_to_token[char]
      if (!token) {
        let index = token_table.length
        let code = String.fromCodePoint(index + 1)
        token = {
          chars: char,
          weight: 1,
          original_weight: 1,
          code,
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

  restoreToCorpus(content: string) {
    let { char_to_token } = this
    let sample_in_code = ''
    for (let char of content) {
      let token = char_to_token[char]
      if (!token) {
        throw new Error(`char not found: ${JSON.stringify(char)}`)
      }
      sample_in_code += token.code
    }
    this.corpus_in_code.push(sample_in_code)
  }

  findNextMerge(options?: {
    /** max number of chars of the merged token */
    max_length?: number
  }) {
    let max_length = options?.max_length || Number.MAX_SAFE_INTEGER
    let { code_to_token } = this
    let index = this.token_table.length
    let new_code = String.fromCodePoint(index + 1)

    // count the number of occurrences of each pair of tokens
    let a_b_c = new Map<Token, Map<Token, Token>>()
    let max_a: Token | undefined
    let max_b: Token | undefined
    let max_c: Token | undefined
    for (let sample_in_code of this.corpus_in_code) {
      let a: Token | undefined // first token in pair
      let b: Token | undefined // second token in pair
      let c: Token | undefined // a + b -> c
      for (let code of sample_in_code) {
        let token = code_to_token[code]
        if (!token) {
          let index = code.codePointAt(0)! - 1
          throw new Error(`token not found, index: ${index}`)
        }
        b = token
        if (a && a.chars.length + b.chars.length <= max_length) {
          let b_c = a_b_c.get(a)
          if (!b_c) {
            b_c = new Map()
            a_b_c.set(a, b_c)
          }
          c = b_c.get(b)
          if (c) {
            c.weight++
          } else {
            c = {
              chars: a.chars + b.chars,
              weight: 1,
              original_weight: 1,
              code: new_code,
              index,
            }
            b_c.set(b, c)
          }

          if (!max_c || max_c.weight < c.weight) {
            max_a = a
            max_b = b
            max_c = c
          }
        }
        a = b
      }
    }

    return max_c ? ([max_a!, max_b!, max_c!] as const) : null
  }

  toJSON(): BPETokenizerJSON {
    let { token_table } = this
    let json: BPETokenizerJSON = {
      version: 'exp',
      chars: [],
      weights: [],
      original_weights: [],
    }
    for (let token of token_table) {
      json.chars.push(token.chars)
      json.weights.push(token.weight)
      json.original_weights.push(token.original_weight)
    }
    return json
  }

  fromJSON(json: BPETokenizerJSON) {
    let { token_table, char_to_token, code_to_token } = this
    let { chars, weights, original_weights } = json
    token_table.length = 0
    let n = json.chars.length
    for (let i = 0; i < n; i++) {
      let char = chars[i]
      let code = String.fromCodePoint(i + 1)
      let token: Token = {
        chars: char,
        weight: weights[i],
        original_weight: original_weights[i],
        code,
        index: i,
      }
      token_table[i] = token
      char_to_token[char] = token
      code_to_token[code] = token
    }
  }
}
