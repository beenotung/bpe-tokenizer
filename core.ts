export type Token = {
  chars: string
  weight: number
  code: string
  index: number
}

// a + b -> c, e.g. "app" + "le" -> "apple"
export type MergeToken = [a: Token, b: Token, c: Token]
export type MergeCode = [a: string, b: string]

export let EOF = String.fromCharCode(4)

export class BPETokenizer {
  char_to_token: Record<string, Token> = {}
  code_to_token: Record<string, Token> = {}

  token_table: Token[] = []

  merge_tokens: MergeToken[] = []
  merge_codes: MergeCode[] = []

  corpus_in_code: string[] = []

  addContent(content: string) {
    let { char_to_token, code_to_token, token_table } = this
    let sample_in_code = ''
    for (let char of EOF + content + EOF) {
      let token = char_to_token[char]
      if (!token) {
        let index = token_table.length
        let code = String.fromCodePoint(index)
        token = { chars: char, weight: 1, code: code, index }
        char_to_token[char] = token
        code_to_token[code] = token
        token_table.push(token)
      } else {
        token.weight++
      }
      sample_in_code += token.code
    }
    this.corpus_in_code.push(sample_in_code)
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
              code: new_code,
              index: new_index,
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

    return max_c ? [max_a!, max_b!, max_c] : null
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
      let [a, b, c] = merge
      if (c.weight < min_weight) break
      this.applyMerge(merge)
    }
  }

  encodeToTokens(content: string): Token[] {
    let { char_to_token, code_to_token } = this

    let content_in_code = ''
    for (let char of content) {
      content_in_code += char_to_token[char].code
    }

    for (let [from_code, to_code] of this.merge_codes) {
      content_in_code = content_in_code.replaceAll(from_code, to_code)
    }

    let tokens: Token[] = []
    for (let code of content_in_code) {
      tokens.push(code_to_token[code])
    }

    return tokens
  }

  encodeToVector(content: string): number[] {
    return this.encodeToTokens(content).map(token => token.index)
  }

  decodeTokens(tokens: Token[]): string {
    let content = ''
    for (let token of tokens) {
      content += token.chars
    }
    return content
  }

  decodeVector(vector: number[]): string {
    let { token_table } = this
    let content = ''
    for (let index of vector) {
      content += token_table[index].chars
    }
    return content
  }
}
