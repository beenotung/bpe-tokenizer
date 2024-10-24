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
 * @description replace from_code (a_code + b_code) into to_code (c_code)
 */
type MergeCode = [from_code: string, to_code: string]

/** @description for BPETokenizer.fromJSON() */
export type BPETokenizerJSON = {
  version: 2
  char_count: number
  token_table: [chars: string, weight: number, original_weight: number][]
  merge_codes: [a_code: string, b_code: string, c_code: string][]
}

/** @description file separator */
export let FS = String.fromCharCode(28)

/** @description end of file */
export let EOF = String.fromCharCode(4)

/** @description "\n" line feed, new line */
export let LF = '\n'

/** @description "\r" carriage return */
export let CR = '\r'

export type Markers = {
  /** @example empty string or \n */
  begin_marker: string
  /** @example EOF or \n */
  end_marker: string
}

/** @description wrap with FS and EOF */
export function fileContentToCorpus(content: string | Buffer): string {
  let text = content.toString()
  return FS + text + EOF
}

/** @description split into lines, wrap with \r and \n */
export function linesToCorpus(text: string): string[] {
  let lines = text.split('\n')
  return lines.map(line => '\r' + line.trim() + '\n')
}

/** @description split into lines, trim spaces, wrap with \r and \n */
export function linesTrimmedToCorpus(text: string): string[] {
  let lines = text.split('\n')
  return lines.map(line => {
    if (line.endsWith('\r')) {
      line = line.slice(0, line.length - 1)
    }
    return '\r' + line + '\n'
  })
}

type MergeCandidate = {
  a: Token
  b: Token
  count: number
  /**
   * @description
   * may no longer include the candidate merge token,
   * not actively removed to avoid unnecessary scanning
   */
  corpus_indices: Set<number>
}

function index_to_code(index: number) {
  return String.fromCodePoint(index + 1) // for uniqueness
  // return (index + 1).toString(36) // for readability
}

export class BPETokenizer2 {
  token_table: Token[] = []

  char_to_token: Record<string, Token> = {}
  code_to_token: Record<string, Token> = {}

  merge_codes: MergeCode[] = []

  corpus_in_code: string[] = []

  /** @description a_code + b_code -> MergeCandidate */
  private merge_candidate_dict: Record<string, MergeCandidate> = {}
  private merge_candidate_array: MergeCandidate[] = []

  /**
   * @description add new content to corpus.
   * Token weights are updated when adding content.
   */
  addToCorpus(content: string) {
    let { token_table, char_to_token, code_to_token, corpus_in_code } = this
    let sample_in_code = ''
    let last_token: Token | null = null
    let corpus_index = corpus_in_code.length
    for (let char of content) {
      let token = char_to_token[char]
      if (!token) {
        let index = token_table.length
        let code = index_to_code(index)
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
      if (last_token) {
        this.incMergeCandidate(last_token, token, corpus_index)
      }
      last_token = token
    }
    this.corpus_in_code.push(sample_in_code)
  }

  /**
   * @description call `findNextMergeCandidate()` and `applyMergeCandidate()` in loop
   */
  mergeUntil(options?: {
    /** @default 2 */
    min_weight?: number
    /** @default unlimited */
    max_length?: number
    /** @default unlimited */
    max_iterations?: number
  }) {
    let max_iterations = options?.max_iterations
    for (
      let iteration = 1;
      !max_iterations || iteration <= max_iterations;
      iteration++
    ) {
      let candidate = this.findNextMergeCandidate(options)
      if (!candidate) break
      this.applyMergeCandidate(candidate)
    }
  }

  /**
   * @description called by `mergeUntil()`.
   * Can be used to implement custom iteration conditions.
   */
  findNextMergeCandidate(options?: {
    /** @default 2 */
    min_weight?: number
    /** @default unlimited */
    max_length?: number
  }): MergeCandidate | null {
    let min_weight = options?.min_weight || 2
    let max_length = options?.max_length

    let max_count = 0
    let best_merge_candidate: MergeCandidate | null = null

    for (let candidate of this.merge_candidate_array) {
      if (
        max_length &&
        candidate.a.chars.length + candidate.b.chars.length > max_length
      )
        continue

      if (candidate.count < max_count) continue

      best_merge_candidate = candidate
      max_count = candidate.count
    }

    if (max_count < min_weight) return null

    return best_merge_candidate
  }

  private incMergeCandidate(a: Token, b: Token, corpus_index: number) {
    let code = a.code + b.code
    let candidate = this.merge_candidate_dict[code]
    if (candidate) {
      candidate.count++
      candidate.corpus_indices.add(corpus_index)
    } else {
      candidate = {
        a,
        b,
        count: 1,
        corpus_indices: new Set([corpus_index]),
      }
      this.merge_candidate_dict[code] = candidate
      this.merge_candidate_array.push(candidate)
    }
    return candidate
  }

  private decMergeCandidate(a: Token, b: Token) {
    let code = a.code + b.code
    let candidate = this.merge_candidate_dict[code]
    if (candidate) {
      candidate.count--
    }
  }

  /**
   * @description called by `mergeUntil()`.
   * Can be used to implement custom iteration conditions.
   */
  applyMergeCandidate(candidate: MergeCandidate) {
    let { code_to_token } = this
    let { a, b } = candidate
    let c_index = this.token_table.length
    let count = 0
    let c: Token = {
      chars: a.chars + b.chars,
      weight: count,
      original_weight: count,
      code: index_to_code(c_index),
      index: c_index,
    }
    this.char_to_token[c.chars] = c
    code_to_token[c.code] = c
    this.token_table.push(c)
    this.merge_codes.push([a.code + b.code, c.code])
    for (let corpus_index of candidate.corpus_indices) {
      let sample_in_code = this.corpus_in_code[corpus_index]

      for (let offset = 0; offset < sample_in_code.length; ) {
        let a_index = sample_in_code.indexOf(a.code, offset)
        if (a_index == -1 || a_index + 1 >= sample_in_code.length) break

        if (sample_in_code[a_index + 1] != b.code) {
          offset = a_index + 1
          continue
        }

        count++
        a.weight--
        b.weight--

        if (a_index > 0) {
          let pre_a_code = sample_in_code[a_index - 1]
          let pre_a = code_to_token[pre_a_code]
          this.decMergeCandidate(pre_a, a)
          this.incMergeCandidate(pre_a, c, corpus_index)
        }

        if (a_index + 2 < sample_in_code.length) {
          let post_b_code = sample_in_code[a_index + 2]
          let post_b = code_to_token[post_b_code]
          this.decMergeCandidate(b, post_b)
          this.incMergeCandidate(c, post_b, corpus_index)
        }

        let before = sample_in_code.slice(0, a_index)
        let after = sample_in_code.slice(a_index + 2)
        sample_in_code = before + c.code + after
      }

      this.corpus_in_code[corpus_index] = sample_in_code
    }
    c.weight = count
    c.original_weight = count
    delete this.merge_candidate_dict[a.code + b.code]
    let index = this.merge_candidate_array.indexOf(candidate)
    if (index != -1) {
      this.merge_candidate_array.splice(index, 1)
    }
  }

  /**
   * @description encode to binary string.
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
}

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

  /**
   * @description export token tables and merge list.
   * The json can be used to restore after restart, or to populate database with BPETokenizerDB.
   */
  toJSON(): BPETokenizerJSON {
    return {
      version: 2,
      char_count: Object.keys(this.char_to_token).length,
      token_table: this.token_table.map(token => [
        token.chars,
        token.weight,
        token.original_weight,
      ]),
      merge_codes: this.merge_tokens.map(([a, b, c]) => [
        a.code,
        b.code,
        c.code,
      ]),
    }
  }

  /** @description restore from json (after restart) */
  fromJSON(json: BPETokenizerJSON) {
    if (
      json.version !== 2 ||
      !Array.isArray(json.token_table) ||
      !Array.isArray(json.merge_codes)
    )
      throw new Error('invalid format')
    let { char_count } = json
    let newInstance = new BPETokenizer()
    let {
      char_to_token,
      code_to_token,
      token_table,
      merge_tokens,
      merge_codes,
    } = newInstance
    Object.assign(this, newInstance)
    for (let [chars, weight, original_weight] of json.token_table) {
      let index = token_table.length
      let code = String.fromCodePoint(index + 1)
      let token: Token = {
        chars,
        weight,
        original_weight,
        code,
        index,
      }
      if (index < char_count) {
        char_to_token[chars] = token
      }
      code_to_token[code] = token
      token_table[index] = token
    }
    for (let [a_code, b_code, c_code] of json.merge_codes) {
      let a: Token = code_to_token[a_code]
      let b: Token = code_to_token[b_code]
      let c: Token = code_to_token[c_code]
      merge_tokens.push([a, b, c])
      merge_codes.push([a.code + b.code, c.code])
    }
    this.compactVectorIndex()
  }

  protected invalidateVectorIndex() {
    this.to_vector_index = null
    this.from_vector_index = null
  }

  /**
   * @description add new content to corpus.
   * Token weights are updated when adding content.
   */
  addToCorpus(content: string) {
    let { char_to_token, code_to_token, token_table } = this
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
  findNextMerge(options?: {
    /** @default 2 */
    min_weight?: number
    /** @default unlimited */
    max_length?: number
  }): MergeToken | null {
    let { code_to_token } = this

    let max_length = options?.max_length
    let min_weight = options?.min_weight || 2

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
        if (
          a &&
          (!max_length || a.chars.length + b.chars.length <= max_length)
        ) {
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
    if (min_weight && max_c_weight < min_weight) return null

    let new_index = this.token_table.length
    let new_code = String.fromCodePoint(new_index + 1)
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

    this.invalidateVectorIndex()

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
    max_length?: number
    /** @default unlimited */
    max_iterations?: number
  }) {
    let max_iterations = options?.max_iterations
    for (
      let iteration = 1;
      !max_iterations || iteration <= max_iterations;
      iteration++
    ) {
      let merge = this.findNextMerge(options)
      if (!merge) break
      this.applyMerge(merge)
    }
  }

  /**
   * @description encode to binary string.
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
    let { code_to_token } = this
    let [a_code, b_code, c_weight] = compactMerge
    let a = code_to_token[a_code]
    if (!a) throw new Error(`unknown token, a_code: ${JSON.stringify(a_code)}`)
    let b = code_to_token[b_code]
    if (!b) throw new Error(`unknown token, b_code: ${JSON.stringify(b_code)}`)
    let index = this.token_table.length
    let code = String.fromCodePoint(index + 1)
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
