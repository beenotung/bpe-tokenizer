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
}
