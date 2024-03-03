import { expect } from 'chai'
import { BPETokenizer, CompactMerge, Token, compactMerge } from './core'

let content_abc = 'aaabdaaabac'
describe(`encode ${content_abc}`, () => {
  it(`should encode "${content_abc}" into segments "aaab d aaab a c"`, () => {
    // initial: "a a a b d a a a b a c"
    // merge "aa": "aa a b d aa a b a c"
    // merge "ab": "aa ab d aa ab a c"
    // merge "aaab": "aaab d aaab a c"
    let tokenizer = new BPETokenizer()
    tokenizer.addToCorpus(content_abc)
    tokenizer.mergeUntil({ min_weight: 2 })
    expect(
      tokenizer
        .encodeToTokens(content_abc)
        .map(token => token.chars)
        .join(' '),
    ).to.deep.equal('aaab d aaab a c')
  })

  it(`should encode "${content_abc}" into vector [4 2 4 1 3]`, () => {
    /**
     * initial:
     * becomes: "a a a b d a a a b a c"
     * 0: _ x 2
     * 1: a x 7
     * 2: b x 2
     * 3: d x 1
     * 4: c x 1
     *
     * merge: a + a
     * becomes: "aa a b d aa a b a c"
     * 0: _ x 2
     * 1: a x 3
     * 2: b x 2
     * 3: d x 1
     * 4: c x 1
     * 5: aa x 2
     *
     * merge: a + b
     * 0: _ x 2
     * 1: a x 1
     * 2: b x 0
     * 3: d x 1
     * 4: c x 1
     * 5: aa x 2
     * 6: ab x 2
     *
     * merge: aa + ab
     * 0: _ x 2
     * 1: a x 1
     * 2: b x 0
     * 3: d x 1
     * 4: c x 1
     * 5: aa x 0
     * 6: ab x 0
     * 7: aaab x 2
     *
     * compact index:
     * 0 -> 0: _ x 2
     * 1 -> 1: a x 1
     *      2: b x 0
     * 2 -> 3: d x 1
     * 3 -> 4: c x 1
     *      5: aa x 0
     *      6: ab x 0
     * 4 -> 7: aaab x 2
     */
    let tokenizer = new BPETokenizer()
    tokenizer.addToCorpus(content_abc)
    tokenizer.mergeUntil({ min_weight: 2 })
    tokenizer.compactVectorIndex()
    expect(tokenizer.encodeToVector(content_abc)).to.deep.equal([4, 2, 4, 1, 3])
  })
})

let content_x = 'xxxxxxxxx'
describe(`encode ${content_x}`, () => {
  it(`should encode "${content_x}" into segments "xxxx xxxx x"`, () => {
    //           initial: "_ x x x x x x x x x _"
    //       merge x + x: "_ xx xx xx xx x _"
    //     merge xx + xx: "xxxx xxxx x"
    let tokenizer = new BPETokenizer()
    tokenizer.addToCorpus(content_x)
    tokenizer.mergeUntil({ min_weight: 2 })
    expect(
      tokenizer
        .encodeToTokens(content_x)
        .map(token => token.chars)
        .join(' '),
    ).to.deep.equal('xxxx xxxx x')
  })

  it(`should encode "${content_x}" into vector [2 2 1]`, () => {
    /**
     * initial:
     * becomes: "_ X X X X X X X X X _"
     * 0: _ x 2
     * 1: X x 9
     *
     * merge: X + X
     * becomes: "_ XX XX XX XX X _"
     * 0: _ x 2
     * 1: X x 1
     * 2: XX x 4
     *
     * merge: XX + XX
     * becomes: "_ XXXX XXXX X _"
     * 0: _ x 2
     * 1: X x 1
     * 2: XX x 0
     * 3: XXXX x 2
     *
     * compact index:
     * 0 -> 0: _ x 2
     * 1 -> 1: X x 1
     *      2: XX x 0
     * 2 -> 3: XXXX x 2
     */
    let tokenizer = new BPETokenizer()
    tokenizer.addToCorpus(content_x)
    tokenizer.mergeUntil({ min_weight: 2 })
    tokenizer.compactVectorIndex()
    expect(tokenizer.encodeToVector(content_x)).to.deep.equal([2, 2, 1])
  })
})

describe('JSON export / import', () => {
  let json = ''
  let token_table: BPETokenizer['token_table']

  it('should export to json', () => {
    let tokenizer = new BPETokenizer()
    tokenizer.addToCorpus(content_abc)
    tokenizer.mergeUntil({ min_weight: 2 })

    expect(tokenizer.toJSON).not.undefined
    json = JSON.stringify(tokenizer)
    expect(json.length).greaterThan(0)

    token_table = tokenizer.token_table
    expect(token_table).not.undefined
    expect(token_table.length).greaterThan(1)
  })

  it('should import from json', () => {
    let tokenizer = new BPETokenizer()
    tokenizer.fromJSON(JSON.parse(json))
    expect(tokenizer.token_table).deep.equals(token_table)
  })
})

describe('resume merges after restart', () => {
  let merges: CompactMerge[] = []
  let vector: number[] = []
  let tokens: Token[] = []

  it('should store merge log', () => {
    let tokenizer = new BPETokenizer()
    tokenizer.addToCorpus(content_abc)
    for (;;) {
      let merge = tokenizer.findNextMerge()
      if (!merge) break
      let [_a, _b, c] = merge
      if (c.weight < 2) break
      merges.push(compactMerge(merge))
      tokenizer.applyMerge(merge)
    }
    tokens = tokenizer.token_table
    vector = tokenizer.encodeToVector(content_abc)
    expect(merges.length).greaterThan(0)
    expect(vector.length).greaterThan(0)
  })

  it('should resume from merge log', () => {
    let tokenizer = new BPETokenizer()
    tokenizer.addToCorpus(content_abc)
    for (let merge of merges) {
      tokenizer.restoreMerge(merge)
    }
    expect(tokenizer.token_table).to.deep.equals(tokens)
    expect(tokenizer.encodeToVector(content_abc)).to.deep.equals(vector)
    expect(tokenizer.decodeVector(vector)).to.equals(content_abc)
  })
})
