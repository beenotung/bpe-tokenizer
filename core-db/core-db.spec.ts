import { expect } from 'chai'
import { BPETokenizer } from '../core'
import { BPETokenizerDB, connectDB, resetBPETokenizerDB } from './core-db'
import { unlinkSync } from 'fs'

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
})
