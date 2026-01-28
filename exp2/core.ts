export type Token = {
  /* decoded substring from the corpus */
  chars: string
  /* occurrence in the corpus after merge */
  weight: number
  /* occurrence in the corpus before merge */
  total_occurrence: number
  /* encoded string from token index */
  code: string
  /* index of the token in the token_table */
  index: number
}

/* returned by `findMergeCandidate()`, used by `applyMergeCandidate()` */
export type MergeCandidate = {
  a: Token
  b: Token
  c: Token
  corpus_indices?: Set<number>
}

export type FindMergeCandidateOptions = {
  max_chars: number
  min_weight: number
}

export type MergeUntilOptions = FindMergeCandidateOptions & {
  max_iterations: number
  on_candidate?: (
    candidate: MergeCandidate,
    iteration: number,
    controller: { stop(): void },
  ) => void
}

export type BPETokenizerJSON = {
  version: 'exp2'
  /** the rest of fields are like parallel arrays for more compact representation */
  chars: string[]
  weights: number[]
  total_occurrences: number[]
  /** sequence of: a + b -> c,
   * encoded as a.code + b.code,
   * c.code can be auto inferred */
  merges: string[]
}

export class BPETokenizer {
  token_table: Token[] = []
  char_to_token: Record<string, Token> = Object.create(null)
  code_to_token: Record<string, Token> = Object.create(null)

  merges: [a: Token, b: Token, c: Token][] = []

  corpus_codes: string[] = []

  /**
   * @description export token table for storage or network transfer
   * - the result can be used in `fromJSON()` to restore the tokenizer
   * - the corpus are not included
   */
  toJSON(): BPETokenizerJSON {
    let { token_table } = this

    let chars: string[] = []
    let weights: number[] = []
    let total_occurrences: number[] = []
    for (let token of token_table) {
      chars.push(token.chars)
      weights.push(token.weight)
      total_occurrences.push(token.total_occurrence)
    }

    let merges: string[] = []
    for (let [a, b] of this.merges) {
      merges.push(a.code + b.code)
    }

    return {
      version: 'exp2',
      chars,
      weights,
      total_occurrences,
      merges,
    }
  }

  fromJSON(json: BPETokenizerJSON) {
    if (json.version !== 'exp2') {
      throw new Error(`expected version: exp2, got: ${json.version}`)
    }
    this.token_table.length = 0
    this.char_to_token = Object.create(null)
    this.code_to_token = Object.create(null)
    this.merges.length = 0
    this.corpus_codes.length = 0
    let { chars, weights, total_occurrences, merges } = json
    for (let i = 0; i < chars.length; i++) {
      let token = {
        chars: chars[i],
        weight: weights[i],
        total_occurrence: total_occurrences[i],
        code: indexToCode(i),
        index: i,
      }
      this.addToken(token)
    }
    /** starts from the number of single-char tokens */
    let c_index = chars.length - merges.length
    for (let merge of merges) {
      let [a_code, b_code] = merge.split('')
      let a = this.code_to_token[a_code]
      if (!a) {
        throw new Error(`token not found, a_code: ${a_code}`)
      }
      let b = this.code_to_token[b_code]
      if (!b) {
        throw new Error(`token not found, b_code: ${b_code}`)
      }
      let c_code = indexToCode(c_index)
      let c = this.code_to_token[c_code]
      if (!c) {
        throw new Error(`token not found, c_code: ${c_code}`)
      }
      this.merges.push([a, b, c])
      c_index++
    }
  }

  addToken(token: Token) {
    this.token_table[token.index] = token
    this.char_to_token[token.chars] = token
    this.code_to_token[token.code] = token
  }

  addToCorpus(content: string) {
    let corpus_code = ''
    for (let char of content) {
      let token = this.char_to_token[char]
      if (!token) {
        let index = this.token_table.length
        let code = indexToCode(index)
        token = {
          chars: char,
          weight: 1,
          total_occurrence: 1,
          code,
          index,
        }
        this.addToken(token)
      } else {
        token.weight++
        token.total_occurrence++
      }
      corpus_code += token.code
    }
    this.corpus_codes.push(corpus_code)
  }

  findMergeCandidate(options: FindMergeCandidateOptions) {
    let { max_chars, min_weight } = options

    // a.code + b.code -> c
    let candidates: Record<string, MergeCandidate> = Object.create(null)

    let c_index = this.token_table.length
    let c_code = indexToCode(c_index)
    let max_candidate: MergeCandidate | undefined
    for (
      let corpus_index = 0;
      corpus_index < this.corpus_codes.length;
      corpus_index++
    ) {
      let corpus_code = this.corpus_codes[corpus_index]
      let a: Token | undefined // first token in pair
      let b: Token | undefined // second token in pair
      for (let code of corpus_code) {
        let token = this.code_to_token[code]
        if (!token) {
          let index = code.codePointAt(0)! - 1
          throw new Error(`token not found, index: ${index}`)
        }
        // first token in corpus
        if (!a) {
          a = token
          continue
        }
        b = token
        let c_chars = a.chars + b.chars
        if (c_chars.length > max_chars) {
          continue
        }
        if (a.weight + b.weight < min_weight) {
          continue
        }
        let c_key = a.code + b.code
        let candidate = candidates[c_key]
        if (!candidate) {
          candidate = {
            a,
            b,
            c: {
              chars: c_chars,
              weight: 1,
              total_occurrence: 0,
              code: c_code,
              index: c_index,
            },
            corpus_indices: new Set([corpus_index]),
          }
          candidates[c_key] = candidate
        } else {
          candidate.c.weight++
          candidate.corpus_indices!.add(corpus_index)
        }
        if (!max_candidate || max_candidate.c.weight < candidate.c.weight) {
          max_candidate = candidate
        }
      }
    }
    if (max_candidate) {
      max_candidate.c.total_occurrence = max_candidate.c.weight
    }
    return max_candidate
  }

  applyMergeCandidate(candidate: MergeCandidate) {
    let { a, b, c } = candidate

    let c_weight = c.weight
    a.weight -= c_weight
    b.weight -= c_weight
    this.addToken(c)
    this.merges.push([a, b, c])

    let from_code = a.code + b.code
    let to_code = c.code

    if (candidate.corpus_indices) {
      for (let corpus_index of candidate.corpus_indices) {
        this.corpus_codes[corpus_index] = this.corpus_codes[
          corpus_index
        ].replaceAll(from_code, to_code)
      }
    } else {
      for (
        let corpus_index = 0;
        corpus_index < this.corpus_codes.length;
        corpus_index++
      ) {
        this.corpus_codes[corpus_index] = this.corpus_codes[
          corpus_index
        ].replaceAll(from_code, to_code)
      }
    }
  }

  mergeUntil(options: MergeUntilOptions) {
    let { max_iterations, on_candidate } = options
    let controller = {
      stop() {
        max_iterations = 0
      },
    }
    for (let iteration = 0; iteration < max_iterations; iteration++) {
      let candidate = this.findMergeCandidate(options)
      if (!candidate) break
      if (on_candidate) {
        on_candidate(candidate, iteration, controller)
        if (max_iterations === 0) break
      }
      this.applyMergeCandidate(candidate)
    }
  }
}

export function indexToCode(index: number) {
  return String.fromCodePoint(index + 1)
}
