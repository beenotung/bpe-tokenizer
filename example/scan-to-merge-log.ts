import { appendFileSync, existsSync, readFileSync } from 'fs'
import { BPETokenizer, compactMerge } from '../core'
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
    let lines = readFileSync(mergeFile).toString().split('\n')
    lines.pop()
    for (let line of lines) {
      let merge = JSON.parse(line)
      tokenizer.restoreMerge(merge)
    }
    console.timeEnd('restore merges')
  }

  console.time('merge tokens')
  for (;;) {
    // console.time('find merge')
    let merge = tokenizer.findNextMerge()
    // console.timeEnd('find merge')
    if (!merge) break
    let [a, b, c] = merge
    if (c.weight < 2) break

    // console.log('new token', [a, b, c])

    let json = compactMerge(merge)
    let line = JSON.stringify(json) + '\n'
    appendFileSync(mergeFile, line)

    // console.time('apply merge')
    tokenizer.applyMerge(merge)
    // console.timeEnd('apply merge')

    let table_size = tokenizer.token_table.length
    let zero_count = 0
    let vector_size = 0
    for (let token of tokenizer.token_table) {
      if (token.weight > 0) {
        vector_size++
      } else {
        zero_count++
      }
    }
    let p = (x: number) => '(' + ((x / table_size) * 100).toFixed(1) + '%)'
    process.stdout.write(
      `\r table size: ${table_size}` +
        ` | zero_count: ${zero_count} ${p(zero_count)}` +
        ` | vector size: ${vector_size} ${p(vector_size)}` +
        ` | new token weight: ${c.weight}` +
        '  ',
    )
  }
  process.stdout.write(`\n`)
  console.timeEnd('merge tokens')
}
main().catch(e => console.error(e))
