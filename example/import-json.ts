import { BPETokenizer } from '../core'
import { BPETokenizerDB, resetBPETokenizerDB } from '../core-db'
import { db } from './db'
import { startTimer } from '@beenotung/tslib/timer'
import { count_corpus, load_corpus_list } from './sample-corpus'
import { expect } from 'chai'
import { writeFileSync } from 'fs'

async function main() {
  resetBPETokenizerDB(db)
  let tokenizer = new BPETokenizer()

  let timer = startTimer('add into corpus')
  timer.setEstimateProgress(count_corpus())
  for await (let corpus of load_corpus_list()) {
    tokenizer.addToCorpus(corpus.content)
    timer.tick()
  }
  timer.end()

  console.time('merge loop')
  for (;;) {
    console.time('findNextMerge')
    let merge = tokenizer.findNextMerge()
    console.timeEnd('findNextMerge')
    if (!merge) break
    let [a, b, c] = merge
    if (c.weight < 5000) break
    console.log('new token:', c)
    tokenizer.applyMerge(merge)
  }
  console.timeEnd('merge loop')

  console.time('export json')
  let tokenizerJSON = tokenizer.toJSON()
  console.timeEnd('export json')

  writeFileSync('tokenizer.json', JSON.stringify(tokenizerJSON))

  let tokenizerDB = new BPETokenizerDB({ db })
  console.time('import json to db')
  tokenizerDB.fromJSON(tokenizerJSON)
  console.timeEnd('import json to db')

  console.time('export db to json')
  let tokenizerDB_JSON = tokenizerDB.toJSON()
  console.timeEnd('export db to json')

  writeFileSync('tokenizer_db.json', JSON.stringify(tokenizerDB_JSON))

  expect(tokenizerDB.toJSON()).deep.equals(tokenizer.toJSON())
}
main().catch(e => console.error(e))
