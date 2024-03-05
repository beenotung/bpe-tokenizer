import { BPETokenizerDB, resetBPETokenizerDB } from '../db'
import { db } from './db'
import { readFileSync } from 'fs'
import { load_corpus_list } from './sample-corpus'

async function main() {
  let mergeFile = 'merge.log'

  resetBPETokenizerDB(db)
  let tokenizerDB = new BPETokenizerDB({ db })

  console.time('add corpus')
  for await (let corpus of load_corpus_list()) {
    tokenizerDB.addToCorpus(corpus.id, corpus.content)
  }
  console.timeEnd('add corpus')

  console.time('restore merges')
  let lines = readFileSync(mergeFile).toString().split('\n')
  lines.pop()
  for (let line of lines) {
    let merge = JSON.parse(line)
    tokenizerDB.restoreMerge(merge)
  }
  console.timeEnd('restore merges')
}
main().catch(e => console.error(e))
