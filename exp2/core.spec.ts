import { expect } from 'chai'
import { BPETokenizer, BPETokenizerJSON, indexToCode, Token } from './core'

describe('BPETokenizer', () => {
  describe('build up token table from chars in corpus', () => {
    it('should count char occurrences as weight', () => {
      let tokenizer = new BPETokenizer()
      tokenizer.addToCorpus('hello')
      expect(tokenizer.token_table).lengthOf(4)

      // 'h'
      expectToken(tokenizer, {
        chars: 'h',
        weight: 1,
        total_occurrence: 1,
        code: indexToCode(0),
        index: 0,
      })

      // 'e'
      expectToken(tokenizer, {
        chars: 'e',
        weight: 1,
        total_occurrence: 1,
        code: indexToCode(1),
        index: 1,
      })

      // 'l'
      expectToken(tokenizer, {
        chars: 'l',
        weight: 2,
        total_occurrence: 2,
        code: indexToCode(2),
        index: 2,
      })

      // 'o'
      expectToken(tokenizer, {
        chars: 'o',
        weight: 1,
        total_occurrence: 1,
        code: indexToCode(3),
        index: 3,
      })
    })

    it('should persist the token across multiple corpus samples', () => {
      let tokenizer = new BPETokenizer()
      tokenizer.addToCorpus('hello')
      tokenizer.addToCorpus('world')

      let chars = [
        ['h', 1],
        ['e', 1],
        ['l', 3],
        ['o', 2],
        ['w', 1],
        ['r', 1],
        ['d', 1],
      ] as const

      expect(tokenizer.token_table).lengthOf(chars.length)

      for (let i = 0; i < chars.length; i++) {
        let [char, weight] = chars[i]
        expectToken(tokenizer, {
          chars: char,
          weight,
          total_occurrence: weight,
          code: indexToCode(i),
          index: i,
        })
      }
    })
  })

  describe('json export/import', () => {
    it('should export to JSON in compact format', () => {
      let tokenizer = new BPETokenizer()
      tokenizer.addToCorpus('hello')
      let json = tokenizer.toJSON()
      expect(json).deep.equal({
        version: 'exp2',
        chars: ['h', 'e', 'l', 'o'],
        weights: [1, 1, 2, 1],
        total_occurrences: [1, 1, 2, 1],
        merges: [],
      })
    })
    it('should import from JSON', () => {
      let tokenizer = new BPETokenizer()
      tokenizer.addToCorpus('hello')

      let json = tokenizer.toJSON()
      let new_tokenizer = new BPETokenizer()
      new_tokenizer.fromJSON(json)
      expect(new_tokenizer.toJSON()).deep.equal(json)
    })
    it('should include merge codes', () => {
      let tokenizer = new BPETokenizer()
      tokenizer.addToCorpus('abcdab')
      let tokens = {
        a: {
          chars: 'a',
          weight: 0,
          total_occurrence: 2,
          code: indexToCode(0),
          index: 0,
        },
        b: {
          chars: 'b',
          weight: 0,
          total_occurrence: 2,
          code: indexToCode(1),
          index: 1,
        },
        ab: {
          chars: 'ab',
          weight: 2,
          total_occurrence: 2,
          code: indexToCode(4),
          index: 4,
        },
      } satisfies Record<string, Token>

      let candidate = tokenizer.findMergeCandidate({
        max_chars: 2,
        min_weight: 2,
      })!
      expect(candidate).not.null
      tokenizer.applyMergeCandidate(candidate)

      let json = tokenizer.toJSON()
      expect(json).deep.equal({
        version: 'exp2',
        chars: ['a', 'b', 'c', 'd', 'ab'],
        weights: [0, 0, 1, 1, 2],
        total_occurrences: [2, 2, 1, 1, 2],
        merges: [tokens.a.code + tokens.b.code + tokens.ab.code],
      })
    })
  })
})

function expectToken(tokenizer: BPETokenizer, token: Token) {
  expect(tokenizer.token_table[token.index]).deep.equal(token)
  expect(tokenizer.char_to_token[token.chars]).deep.equal(token)
  expect(tokenizer.code_to_token[token.code]).deep.equal(token)
}
