import { expect } from 'chai'
import { BPETokenizer, Token, BPETokenizerJSON } from './core'

describe('BPETokenizer', () => {
  describe('build up token table from chars in corpus', () => {
    it('should count char occurrences as weight', () => {
      let tokenizer = new BPETokenizer()
      tokenizer.addToCorpus('hello')
      expect(tokenizer.token_table.length).to.equal(4)

      let token: Token

      // 'h'
      token = {
        chars: 'h',
        weight: 1,
        original_weight: 1,
        index: 0,
        code: String.fromCodePoint(0 + 1),
      }
      expect(tokenizer.token_table[0]).to.deep.equal(token)

      // 'e'
      token = {
        chars: 'e',
        weight: 1,
        original_weight: 1,
        index: 1,
        code: String.fromCodePoint(1 + 1),
      }
      expect(tokenizer.token_table[1]).to.deep.equal(token)

      // 'l'
      token = {
        chars: 'l',
        weight: 2,
        original_weight: 2,
        index: 2,
        code: String.fromCodePoint(2 + 1),
      }
      expect(tokenizer.token_table[2]).to.deep.equal(token)

      // 'o'
      token = {
        chars: 'o',
        weight: 1,
        original_weight: 1,
        index: 3,
        code: String.fromCodePoint(3 + 1),
      }
      expect(tokenizer.token_table[3]).to.deep.equal(token)
    })

    it('should persist the token across multiple corpus samples', () => {
      let tokenizer = new BPETokenizer()
      tokenizer.addToCorpus('hello')
      tokenizer.addToCorpus('world')

      const chars = [
        ['h', 1] as const,
        ['e', 1] as const,
        ['l', 3] as const,
        ['o', 2] as const,
        ['w', 1] as const,
        ['r', 1] as const,
        ['d', 1] as const,
      ]

      expect(tokenizer.token_table.length).to.equal(chars.length)

      for (let i = 0; i < chars.length; i++) {
        let [char, weight] = chars[i]
        let token: Token = {
          chars: char,
          weight,
          original_weight: weight,
          index: i,
          code: String.fromCodePoint(i + 1),
        }
        expect(tokenizer.token_table[i]).to.deep.equal(token)
      }
    })
  })

  describe('json export/import', () => {
    let json: BPETokenizerJSON
    before(() => {
      let bpeTokenizer = new BPETokenizer()
      bpeTokenizer.addToCorpus('hello')
      json = bpeTokenizer.toJSON()
    })
    it('should export to JSON in compact format', () => {
      expect(json).to.deep.equal({
        version: 'exp',
        chars: ['h', 'e', 'l', 'o'],
        weights: [1, 1, 2, 1],
        original_weights: [1, 1, 2, 1],
      })
    })
    it('should import from JSON', () => {
      let bpeTokenizer = new BPETokenizer()
      bpeTokenizer.fromJSON(json)
      expect(bpeTokenizer.token_table.length).to.equal(4)
      expect(bpeTokenizer.token_table[0].chars).to.equal('h')
      expect(bpeTokenizer.token_table[1].chars).to.equal('e')
      expect(bpeTokenizer.token_table[2].chars).to.equal('l')
      expect(bpeTokenizer.token_table[3].chars).to.equal('o')
      expect(bpeTokenizer.toJSON()).to.deep.equal(json)
    })
  })

  describe('find next merge', () => {
    it('should find pair with max occurrence', () => {
      let tokenizer = new BPETokenizer()
      tokenizer.addToCorpus('abcdab')
      expect(tokenizer.token_table.length).to.equal(4)

      let merge = tokenizer.findNextMerge()!
      expect(merge).not.null

      let [a, b, c] = merge
      expect(a.chars).to.equal('a')
      expect(b.chars).to.equal('b')
      expect(c.chars).to.equal('ab')

      let token: Token = {
        chars: 'ab',
        weight: 2,
        original_weight: 1,
        index: 4,
        code: String.fromCodePoint(4 + 1),
      }
      expect(c).to.deep.equal(token)
    })
  })
})
