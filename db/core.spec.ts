import { expect } from 'chai'
import { BPETokenizer, EOF } from '../core'
import {
  BPETokenizerDB,
  MergeToken,
  connectDB,
  resetBPETokenizerDB,
} from './core'
import { unlinkSync } from 'fs'
import { unProxy } from 'better-sqlite3-proxy'

let content = 'aaabdaaabac'
let dbFile = 'BPE-tokenizer-test.sqlite3'

let db = connectDB(dbFile)

beforeEach(() => {
  resetBPETokenizerDB(db)
})

after(() => {
  db.close()
  unlinkSync(dbFile)
})

describe('BPETokenizerDB', () => {
  it('should import from BPETokenizer', () => {
    let tokenizer = new BPETokenizer()
    tokenizer.addToCorpus(content)
    tokenizer.mergeUntil({ min_weight: 2 })

    let tokenizerDB = new BPETokenizerDB({ db })
    tokenizerDB.fromJSON(tokenizer.toJSON())

    expect(tokenizerDB.toJSON()).deep.equals(tokenizer.toJSON())
  })

  it('should encode to vector as same as BPETokenizer', () => {
    let tokenizer = new BPETokenizer()
    tokenizer.addToCorpus(content)
    tokenizer.mergeUntil({ min_weight: 2 })

    let tokenizerDB = new BPETokenizerDB({ db })
    tokenizerDB.addToCorpus(1, content)
    tokenizerDB.mergeUntil({ min_weight: 2 })
    // tokenizerDB.fromJSON(tokenizer.toJSON())

    expect(tokenizerDB.encodeToVector(content)).deep.equals(
      tokenizer.encodeToVector(content),
    )
  })

  it('should decode tokens', () => {
    let tokenizerDB = new BPETokenizerDB({ db })
    tokenizerDB.addToCorpus(1, content)
    tokenizerDB.mergeUntil({ min_weight: 2 })

    let tokens = tokenizerDB.encodeToTokens(content)
    expect(tokenizerDB.decodeTokens(tokens)).equals(content)
  })

  it('should decode from vector', () => {
    let tokenizerDB = new BPETokenizerDB({ db })
    tokenizerDB.addToCorpus(1, content)
    tokenizerDB.mergeUntil({ min_weight: 2 })

    let vector = tokenizerDB.encodeToVector(content)
    expect(tokenizerDB.decodeVector(vector)).equals(content)
  })

  it('should decode tokens into same result after import from json', () => {
    let tokenizer = new BPETokenizer()
    tokenizer.addToCorpus(content)
    tokenizer.mergeUntil({ min_weight: 2 })

    let tokenizerDB = new BPETokenizerDB({ db })
    tokenizerDB.fromJSON(tokenizer.toJSON())

    let s1 = tokenizer.decodeTokens(tokenizer.encodeToTokens(content))
    let s2 = tokenizerDB.decodeTokens(tokenizerDB.encodeToTokens(content))

    expect(s2).to.equals(content)
    expect(s2).to.equals(s1)
  })
})

describe('encodeToVector', () => {
  it('should invalidate after each merge', () => {
    let content = 'x'.repeat(10)

    // step 0: _ 10x _
    // step 1: _ 2x 2x 2x 2x 2x _
    // step 2: _ 4x 4x 2x _

    resetBPETokenizerDB(db)
    let tokenizer = new BPETokenizerDB({ db })
    tokenizer.addToCorpus(1, content)

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

  let tokenizer: BPETokenizerDB
  beforeEach(() => {
    resetBPETokenizerDB(db)
    tokenizer = new BPETokenizerDB({ db })
    tokenizer.addToCorpus(1, content)
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

  let tokenizer: BPETokenizerDB
  beforeEach(() => {
    resetBPETokenizerDB(db)
    tokenizer = new BPETokenizerDB({ db })
    tokenizer.addToCorpus(1, content)
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

  let tokenizer: BPETokenizerDB
  function setup() {
    resetBPETokenizerDB(db)
    tokenizer = new BPETokenizerDB({ db })
    tokenizer.addToCorpus(1, content)
  }
  beforeEach(setup)

  it('should merge until over min weight limit', () => {
    // step 0: _ x x x x x x x x x x _
    // step 1: _ xx xx xx xx xx _
    // step 2: _ xxxx xxxx xx _
    tokenizer.mergeUntil({ min_weight: 2 })

    let token_table = tokenizer.proxy.token
    expect(token_table).lengthOf(4)

    expect(token_table[1].chars).to.equal(EOF)
    expect(token_table[1].weight).to.equal(2)

    expect(token_table[2].chars).to.equal('x')
    expect(token_table[2].weight).to.equal(0)

    expect(token_table[3].chars).to.equal('xx')
    expect(token_table[3].weight).to.equal(1)

    expect(token_table[4].chars).to.equal('xxxx')
    expect(token_table[4].weight).to.equal(2)

    setup()

    // step 0: _ x x x x x x x x x x _
    // step 1: _ xx xx xx xx xx _
    tokenizer.mergeUntil({ min_weight: 3 })

    expect(token_table).lengthOf(3)

    expect(token_table[1].chars).to.equal(EOF)
    expect(token_table[1].weight).to.equal(2)

    expect(token_table[2].chars).to.equal('x')
    expect(token_table[2].weight).to.equal(0)

    expect(token_table[3].chars).to.equal('xx')
    expect(token_table[3].weight).to.equal(5)
  })

  it('should merge until over max length limit', () => {
    // step 0: _ x x x x x x x x x x _
    // step 1: _ xx xx xx xx xx _
    // step 2: _ xxxx xxxx xx _
    tokenizer.mergeUntil({ max_length: 4 })

    let token_table = tokenizer.proxy.token
    expect(token_table).lengthOf(4)

    expect(token_table[1].chars).to.equal(EOF)
    expect(token_table[1].weight).to.equal(2)

    expect(token_table[2].chars).to.equal('x')
    expect(token_table[2].weight).to.equal(0)

    expect(token_table[3].chars).to.equal('xx')
    expect(token_table[3].weight).to.equal(1)

    expect(token_table[4].chars).to.equal('xxxx')
    expect(token_table[4].weight).to.equal(2)

    setup()

    // step 0: _ x x x x x x x x x x _
    // step 1: _ xx xx xx xx xx _
    tokenizer.mergeUntil({ max_length: 3 })

    expect(token_table).lengthOf(3)

    expect(token_table[1].chars).to.equal(EOF)
    expect(token_table[1].weight).to.equal(2)

    expect(token_table[2].chars).to.equal('x')
    expect(token_table[2].weight).to.equal(0)

    expect(token_table[3].chars).to.equal('xx')
    expect(token_table[3].weight).to.equal(5)
  })

  it('should merge until over max length and min weight limit', () => {
    // step 0: _ x x x x x x x x x x _
    // step 1: _ xx xx xx xx xx _
    tokenizer.mergeUntil({ min_weight: 3, max_length: 3 })

    let token_table = tokenizer.proxy.token
    expect(token_table.length).equals(3)

    expect(token_table[1].chars).to.equal(EOF)
    expect(token_table[1].weight).to.equal(2)

    expect(token_table[2].chars).to.equal('x')
    expect(token_table[2].weight).to.equal(0)

    expect(token_table[3].chars).to.equal('xx')
    expect(token_table[3].weight).to.equal(5)
  })
})
