import { startTimer } from '@beenotung/tslib/timer'
import { BPETokenizerDB, resetBPETokenizerDB } from '../db'
import { db } from './db'
import { count_corpus, load_corpus_list } from './sample-corpus'

async function main() {
  resetBPETokenizerDB(db)
  let tokenizer = new BPETokenizerDB({ db })

  let last_post_id = tokenizer.getLastCorpusId() || 0
  let timer = startTimer('add into corpus')
  timer.setEstimateProgress(count_corpus() - last_post_id)
  for await (let corpus of load_corpus_list()) {
    if (corpus.id <= last_post_id) continue
    tokenizer.addToCorpus(corpus.id, corpus.content)
    // tokenizer.restoreToCorpus(corpus.id, corpus.content)
    if (corpus.content.endsWith('\n')) {
      timer.tick()
    }
  }
  timer.end()

  console.time('merge loop')
  for (;;) {
    console.time('findNextMerge')
    let merge = tokenizer.findNextMerge()
    console.timeEnd('findNextMerge')
    if (!merge) break
    let [a, b, c] = merge
    if (c.weight < 200) break
    console.log('new token:', c)
    tokenizer.applyMerge(merge)
  }
  console.timeEnd('merge loop')
}
main().catch(e => console.error(e))
