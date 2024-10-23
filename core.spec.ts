import { expect } from 'chai'
import {
  BPETokenizer,
  BPETokenizer2,
  CompactMerge,
  EOF,
  MergeToken,
  Token,
  compactMerge,
} from './core'
import { readFileSync } from 'fs'

/** @description for legacy format */
function wrapContent(content: string) {
  return EOF + content + EOF
}

let content_abc = 'aaabdaaabac'
describe(`encode ${content_abc}`, () => {
  it(`should encode "${content_abc}" into segments "aaab d aaab a c"`, () => {
    // initial: "a a a b d a a a b a c"
    // merge "aa": "aa a b d aa a b a c"
    // merge "ab": "aa ab d aa ab a c"
    // merge "aaab": "aaab d aaab a c"
    let tokenizer = new BPETokenizer2()
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
    tokenizer.addToCorpus(wrapContent(content_abc))
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
    tokenizer.addToCorpus(wrapContent(content_x))
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
    tokenizer.addToCorpus(wrapContent(content_x))
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
    tokenizer.addToCorpus(wrapContent(readFileSync(__filename).toString()))
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
    tokenizer.addToCorpus(wrapContent(content_abc))
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
    tokenizer.addToCorpus(wrapContent(content_abc))
    for (let merge of merges) {
      tokenizer.restoreMerge(merge)
    }
    expect(tokenizer.token_table).to.deep.equals(tokens)
    expect(tokenizer.encodeToVector(content_abc)).to.deep.equals(vector)
    expect(tokenizer.decodeVector(vector)).to.equals(content_abc)
  })
})

describe('encodeToVector', () => {
  it('should invalidate after each merge', () => {
    let content = 'x'.repeat(10)

    // step 0: _ 10x _
    // step 1: _ 2x 2x 2x 2x 2x _
    // step 2: _ 4x 4x 2x _

    let tokenizer = new BPETokenizer()
    tokenizer.addToCorpus(wrapContent(content))

    expect(tokenizer.encodeToVector(content)).deep.equals([
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    ])

    let merge = tokenizer.findNextMerge({ max_length: 5 })
    tokenizer.applyMerge(merge!)
    expect(tokenizer.encodeToVector(content)).deep.equals([1, 1, 1, 1, 1])

    merge = tokenizer.findNextMerge({ max_length: 5 })
    tokenizer.applyMerge(merge!)
    expect(tokenizer.encodeToVector(content)).deep.equals([2, 2, 1])
  })
})

describe('find next merge within length limit', () => {
  let content = 'x'.repeat(10)

  // step 0: _ 10x _
  // step 1: _ 2x 2x 2x 2x 2x _
  // step 2: _ 4x 4x 2x _

  let tokenizer: BPETokenizer
  beforeEach(() => {
    tokenizer = new BPETokenizer()
    tokenizer.addToCorpus(wrapContent(content))
  })

  function expectMerge(merge: MergeToken | null, a: string, b: string) {
    expect(merge).not.null
    expect(merge![0].chars).to.equals(a)
    expect(merge![1].chars).to.equals(b)
    expect(merge![2].chars).to.equals(a + b)
  }

  it('should find merge within length limit', () => {
    let merge = tokenizer.findNextMerge()
    expectMerge(merge, 'x', 'x')
    tokenizer.applyMerge(merge!)

    merge = tokenizer.findNextMerge({ max_length: 4 })
    expectMerge(merge, 'xx', 'xx')
    expect(merge![2].chars).to.equals('xxxx')
  })

  it('should not find merge exceed length limit', () => {
    let merge = tokenizer.findNextMerge()
    expectMerge(merge, 'x', 'x')
    tokenizer.applyMerge(merge!)

    merge = tokenizer.findNextMerge({ max_length: 3 })
    expect(merge).null
  })
})

describe('find next merge within weight limit', () => {
  let content = 'x'.repeat(10)

  // step 0: _ 10x _
  // step 1: _ 2x 2x 2x 2x 2x _
  // step 2: _ 4x 4x 2x _

  let tokenizer: BPETokenizer
  beforeEach(() => {
    tokenizer = new BPETokenizer()
    tokenizer.addToCorpus(wrapContent(content))
  })

  it('should find merge above weight limit', () => {
    let merge = tokenizer.findNextMerge({ min_weight: 5 })
    expect(merge).not.null
    expect(merge![0].chars).equals('x')
    expect(merge![1].chars).equals('x')
    expect(merge![2].chars).equals('xx')
  })

  it('should not find merge below weight limit', () => {
    let merge = tokenizer.findNextMerge({ min_weight: 6 })
    expect(merge).null
  })

  it('should find all merges if weight limit is not specified', () => {
    // _ x x x x x x x x x x _
    let merge = tokenizer.findNextMerge()
    expect(merge).not.null
    expect(merge![0].chars).equals('x')
    expect(merge![1].chars).equals('x')
    expect(merge![2].chars).equals('xx')
    tokenizer.applyMerge(merge!)

    // _ xx xx xx xx xx _
    merge = tokenizer.findNextMerge()
    expect(merge).not.null
    expect(merge![0].chars).equals('xx')
    expect(merge![1].chars).equals('xx')
    expect(merge![2].chars).equals('xxxx')
    tokenizer.applyMerge(merge!)

    // _ xxxx xxxx xx _
    merge = tokenizer.findNextMerge()
    expect(merge).null
  })
})

describe('mergeUntil', () => {
  let content = 'x'.repeat(10)

  let tokenizer: BPETokenizer
  function setup() {
    tokenizer = new BPETokenizer()
    tokenizer.addToCorpus(wrapContent(content))
  }
  beforeEach(setup)

  it('should merge until over min weight limit', () => {
    // step 0: _ x x x x x x x x x x _
    // step 1: _ xx xx xx xx xx _
    // step 2: _ xxxx xxxx xx _
    tokenizer.mergeUntil({ min_weight: 2 })

    expect(tokenizer.token_table).lengthOf(4)

    expect(tokenizer.token_table[0].chars).to.equal(EOF)
    expect(tokenizer.token_table[0].weight).to.equal(2)

    expect(tokenizer.token_table[1].chars).to.equal('x')
    expect(tokenizer.token_table[1].weight).to.equal(0)

    expect(tokenizer.token_table[2].chars).to.equal('xx')
    expect(tokenizer.token_table[2].weight).to.equal(1)

    expect(tokenizer.token_table[3].chars).to.equal('xxxx')
    expect(tokenizer.token_table[3].weight).to.equal(2)

    setup()

    // step 0: _ x x x x x x x x x x _
    // step 1: _ xx xx xx xx xx _
    tokenizer.mergeUntil({ min_weight: 3 })

    expect(tokenizer.token_table).lengthOf(3)

    expect(tokenizer.token_table[0].chars).to.equal(EOF)
    expect(tokenizer.token_table[0].weight).to.equal(2)

    expect(tokenizer.token_table[1].chars).to.equal('x')
    expect(tokenizer.token_table[1].weight).to.equal(0)

    expect(tokenizer.token_table[2].chars).to.equal('xx')
    expect(tokenizer.token_table[2].weight).to.equal(5)
  })

  it('should merge until over max length limit', () => {
    // step 0: _ x x x x x x x x x x _
    // step 1: _ xx xx xx xx xx _
    // step 2: _ xxxx xxxx xx _
    tokenizer.mergeUntil({ max_length: 4 })

    expect(tokenizer.token_table).lengthOf(4)

    expect(tokenizer.token_table[0].chars).to.equal(EOF)
    expect(tokenizer.token_table[0].weight).to.equal(2)

    expect(tokenizer.token_table[1].chars).to.equal('x')
    expect(tokenizer.token_table[1].weight).to.equal(0)

    expect(tokenizer.token_table[2].chars).to.equal('xx')
    expect(tokenizer.token_table[2].weight).to.equal(1)

    expect(tokenizer.token_table[3].chars).to.equal('xxxx')
    expect(tokenizer.token_table[3].weight).to.equal(2)

    setup()

    // step 0: _ x x x x x x x x x x _
    // step 1: _ xx xx xx xx xx _
    tokenizer.mergeUntil({ max_length: 3 })

    expect(tokenizer.token_table).lengthOf(3)

    expect(tokenizer.token_table[0].chars).to.equal(EOF)
    expect(tokenizer.token_table[0].weight).to.equal(2)

    expect(tokenizer.token_table[1].chars).to.equal('x')
    expect(tokenizer.token_table[1].weight).to.equal(0)

    expect(tokenizer.token_table[2].chars).to.equal('xx')
    expect(tokenizer.token_table[2].weight).to.equal(5)
  })

  it('should merge until over max length and min weight limit', () => {
    // step 0: _ x x x x x x x x x x _
    // step 1: _ xx xx xx xx xx _
    tokenizer.mergeUntil({ min_weight: 3, max_length: 3 })

    expect(tokenizer.token_table).lengthOf(3)

    expect(tokenizer.token_table[0].chars).to.equal(EOF)
    expect(tokenizer.token_table[0].weight).to.equal(2)

    expect(tokenizer.token_table[1].chars).to.equal('x')
    expect(tokenizer.token_table[1].weight).to.equal(0)

    expect(tokenizer.token_table[2].chars).to.equal('xx')
    expect(tokenizer.token_table[2].weight).to.equal(5)
  })
})
