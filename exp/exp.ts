import { startTimer } from '@beenotung/tslib/timer'
import { BPETokenizerDB } from './core-db'
import { db as tokenizer_db } from './db'
import { db as example_db } from '../example/db'

let select_post = example_db.prepare(
  'select id, content from source_post where id > :last_post_id',
)
let count_post = example_db
  .prepare('select count(id) from source_post where id > :last_post_id')
  .pluck()

let tokenizer = new BPETokenizerDB({ db: tokenizer_db })

let last_post_id = tokenizer.getLastCorpusExternalId() || 0
let timer = startTimer('add into corpus')
timer.setEstimateProgress(count_post.get({ last_post_id }) as number)
for (let post of select_post.all({ last_post_id }) as {
  id: number
  content: string
}[]) {
  tokenizer.addToCorpus(post.id, post.content)
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
