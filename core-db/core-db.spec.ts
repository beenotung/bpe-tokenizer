import { expect } from 'chai'
import { BPETokenizer } from '../core'
import { BPETokenizerDB, connectDB } from './core-db'
import { unlinkSync } from 'fs'

it('should import from BPETokenizer', () => {
  let tokenizer = new BPETokenizer()
  let content = 'aaabdaaabac'
  tokenizer.addToCorpus(content)
  tokenizer.mergeUntil({ min_weight: 2 })

  let dbFile = 'BPE-tokenizer-test.sqlite3'
  let db = connectDB(dbFile)
  let tokenizerDB = new BPETokenizerDB({ db })
  tokenizerDB.fromJSON(tokenizer.toJSON())

  expect(tokenizerDB.toJSON()).deep.equals(tokenizer.toJSON())

  db.close()
  unlinkSync(dbFile)
})
