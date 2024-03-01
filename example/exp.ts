import { BPETokenizer } from '../core'
import { proxy } from './proxy'
import { startTimer } from '@beenotung/tslib/timer'

let tokenizer = new BPETokenizer()

let timer = startTimer('add into corpus')
timer.setEstimateProgress(proxy.source_post.length)
for (let post of proxy.source_post) {
  tokenizer.addToCorpus(post.content)
  timer.tick()
}
timer.end()

for (;;) {
  console.time('findNextMerge')
  let merge = tokenizer.findNextMerge()
  console.timeEnd('findNextMerge')
  if (!merge) break
  let [_a, _b, c] = merge
  if (c.weight < 3) break

  tokenizer.applyMerge(merge)
  // let { corpus_set, ...rest } = c
  // console.log(rest)
  console.log(c)
}
