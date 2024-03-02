import { startTimer } from '@beenotung/tslib/timer'
import { BPETokenizerDB } from './core-db'
import { db as tokenizer_db } from './db'
import { count_corpus, load_corpus_list } from './sample-corpus'

async function main() {
  let tokenizer = new BPETokenizerDB({ db: tokenizer_db })

  let last_post_id = tokenizer.getLastCorpusId() || 0
  let timer = startTimer('add into corpus')
  timer.setEstimateProgress(count_corpus() - last_post_id)
  for await (let corpus of load_corpus_list()) {
    if (corpus.id <= last_post_id) continue
    tokenizer.addToCorpus(corpus.id, corpus.content)
    timer.tick()
  }
  timer.end()

  for (;;) {
    console.time('findNextMerge')
    let merge = tokenizer.findNextMerge()
    console.timeEnd('findNextMerge')
    if (!merge) break
    let [a, b, c] = merge
    console.log('new token:', c)
    tokenizer.applyMerge(merge)
  }
}
main().catch(e => console.error(e))
