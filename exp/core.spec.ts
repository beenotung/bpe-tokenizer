import { expect } from 'chai'
import { BPETokenizer, Token, BPETokenizerJSON, MergeTokens } from './core'

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
        merge_from_codes: [],
        merge_to_codes: [],
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
    it('should include merge codes', () => {
      let tokenizer = new BPETokenizer()
      let a: Token = {
        chars: 'a',
        weight: 0,
        original_weight: 2,
        index: 0,
        code: String.fromCodePoint(1),
      }
      let b: Token = {
        chars: 'b',
        weight: 0,
        original_weight: 2,
        index: 1,
        code: String.fromCodePoint(2),
      }
      let ab: Token = {
        chars: 'ab',
        weight: 2,
        original_weight: 2,
        index: 2,
        code: String.fromCodePoint(3),
      }
      tokenizer.token_table = [a, b, ab]
      tokenizer.merge_codes = [[a.code + b.code, ab.code]]
      let json = tokenizer.toJSON()
      expect(json.merge_from_codes).to.deep.equal([a.code + b.code])
      expect(json.merge_to_codes).to.deep.equal([ab.code])
    })
  })

  describe('merging tokens', () => {
    let corpus = 'abcdab'
    let codes = {
      a: String.fromCodePoint(1),
      b: String.fromCodePoint(2),
      c: String.fromCodePoint(3),
      d: String.fromCodePoint(4),
      ab: String.fromCodePoint(5),
    }

    it('should find pair with max occurrence', () => {
      let tokenizer = new BPETokenizer()
      tokenizer.addToCorpus(corpus)
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

    it('should merge tokens and update corpus', () => {
      let tokenizer = new BPETokenizer()
      tokenizer.addToCorpus(corpus)

      expect(tokenizer.corpus_in_code).to.deep.equal([
        codes.a + codes.b + codes.c + codes.d + codes.a + codes.b,
      ])
      let a = tokenizer.token_table[0]
      let b = tokenizer.token_table[1]
      let ab: Token = {
        chars: 'ab',
        weight: 2,
        original_weight: 2,
        index: 4,
        code: String.fromCodePoint(5),
      }
      tokenizer.mergeTokens([a, b, ab])
      expect(tokenizer.corpus_in_code).to.deep.equal([
        codes.ab + codes.c + codes.d + codes.ab,
      ])
    })
    it('should resume merged tokens from JSON', () => {
      let tokenizer = new BPETokenizer()
      tokenizer.addToCorpus(corpus)
      expect(tokenizer.token_table.length).to.equal(4)
      let merge = tokenizer.findNextMerge()!
      tokenizer.mergeTokens(merge)
      expect(tokenizer.token_table.length).to.equal(5)
      let json = tokenizer.toJSON()
      tokenizer = new BPETokenizer()
      tokenizer.fromJSON(json)
      expect(tokenizer.token_table.length).to.equal(5)
    })
    it('should restore corpus', () => {
      let tokenizer = new BPETokenizer()
      tokenizer.addToCorpus(corpus)
      let merge = tokenizer.findNextMerge()!
      tokenizer.mergeTokens(merge)
      let json = tokenizer.toJSON()
      tokenizer = new BPETokenizer()
      tokenizer.fromJSON(json)
      tokenizer.restoreToCorpus(corpus)
      expect(tokenizer.corpus_in_code).to.deep.equal([
        codes.ab + codes.c + codes.d + codes.ab,
      ])
    })
  })
})
