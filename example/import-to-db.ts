import { BPETokenizerJSON } from '../core'
import { BPETokenizerDB, resetBPETokenizerDB } from '../db'
import { db } from './db'
import { readFileSync } from 'fs'

async function main() {
  let tokenizerFile = 'tokenizer.json'

  console.time('load tokenizer file')
  let text = readFileSync(tokenizerFile).toString()
  let json = JSON.parse(text) as BPETokenizerJSON
  console.timeEnd('load tokenizer file')

  resetBPETokenizerDB(db)
  let tokenizerDB = new BPETokenizerDB({ db })

  console.time('import to db')
  tokenizerDB.fromJSON(json)
  console.timeEnd('import to db')
}
main().catch(e => console.error(e))
