import { BPETokenizer, BPETokenizerJSON } from '../core'
import { load_corpus_list } from './sample-corpus'
import { createReadStream, writeFileSync } from 'fs'
import { stream_lines } from '@beenotung/tslib/file-stream'

async function main() {
  let mergeFile = 'merge.log'
  let tokenizerFile = 'tokenizer.json'
  let tokensFile = 'tokens.json'

  let json: BPETokenizerJSON

  let tokenizer = new BPETokenizer()

  // add corpus for single-character tokens
  console.time('add corpus')
  for await (let corpus of load_corpus_list()) {
    tokenizer.addToCorpus(corpus.content)
  }
  console.timeEnd('add corpus')

  // remove corpus to speed up merge recovery
  tokenizer.corpus_in_code = []

  console.time('restore merges')
  for await (let line of stream_lines(createReadStream(mergeFile))) {
    if (line) {
      let merge = JSON.parse(line)
      tokenizer.restoreMerge(merge)
    }
  }
  console.timeEnd('restore merges')

  console.time('export to json')
  json = tokenizer.toJSON()
  console.timeEnd('export to json')

  console.time('save tokenizer file')
  writeFileSync(tokenizerFile, JSON.stringify(json, null, 2))
  console.timeEnd('save tokenizer file')

  writeFileSync(tokensFile, JSON.stringify(tokenizer.token_table, null, 2))
}
main().catch(e => console.error(e))
