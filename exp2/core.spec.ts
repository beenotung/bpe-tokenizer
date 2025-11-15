import { expect } from 'chai'
import { BPETokenizer, indexToCode, Token } from './core'

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
})

function expectToken(tokenizer: BPETokenizer, token: Token) {
  expect(tokenizer.token_table[token.index]).deep.equal(token)
  expect(tokenizer.char_to_token[token.chars]).deep.equal(token)
  expect(tokenizer.code_to_token[token.code]).deep.equal(token)
}
