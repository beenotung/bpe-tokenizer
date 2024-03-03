import { appendFileSync, createReadStream, existsSync, mkdirSync } from 'fs'
import { BPETokenizer, compactMerge } from '../core'
import { stream_lines } from '@beenotung/tslib/file-stream'
import { load_corpus_list } from './sample-corpus'

async function main() {
  let mergeFile = 'merge.log'

  let tokenizer = new BPETokenizer()

  console.time('add corpus')
  for await (let corpus of load_corpus_list()) {
    tokenizer.addToCorpus(corpus.content)
  }
  console.timeEnd('add corpus')

  if (existsSync(mergeFile)) {
    console.time('restore merges')
    for await (let line of stream_lines(createReadStream(mergeFile))) {
      if (line) {
        let merge = JSON.parse(line)
        tokenizer.restoreMerge(merge)
      }
    }
    console.timeEnd('restore merges')
    debugger
  }

  console.time('merge tokens')
  for (;;) {
    // console.time('find merge')
    let merge = tokenizer.findNextMerge()
    // console.timeEnd('find merge')
    if (!merge) break
    let [a, b, c] = merge
    if (c.weight < 2) break

    console.log('new token', [a, b, c])

    let json = compactMerge(merge)
    let line = JSON.stringify(json) + '\n'
    appendFileSync(mergeFile, line)

    // console.time('apply merge')
    tokenizer.applyMerge(merge)
    // console.timeEnd('apply merge')
  }
  console.timeEnd('merge tokens')
}
main().catch(e => console.error(e))
