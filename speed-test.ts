import { readFileSync } from 'fs'
import { BPETokenizer, BPETokenizer2 } from './core'

let full_corpus = readFileSync('corpus.txt')
  .toString()
  .trim()
  .split('\n')
  .map(line => JSON.parse(line))
  .map(([author, content]) => ({ author, content }))

function testSample(n: number) {
  let sample_corpus: string[] = full_corpus
    .slice(0, n)
    .map(sample => sample.content)

  function testTokenizer(tokenizer: BPETokenizer2 | BPETokenizer) {
    let start = performance.now()

    for (let corpus of sample_corpus) {
      tokenizer.addToCorpus(corpus)
    }
    let mid = performance.now()
    tokenizer.mergeUntil({ min_weight: 2 })
    let end = performance.now()

    console.log(
      `sample ${n} took ${end - start}ms for ${
        tokenizer.constructor.name
      } (add_to_corpus: ${mid - start}ms, merge: ${end - mid}ms)`,
    )
  }

  // testTokenizer(new BPETokenizer())
  testTokenizer(new BPETokenizer2())
}

// testSample(0)
// for (let i = 1; i < 1000; i += i) {
//   console.log()
//   testSample(i)
// }
testSample(512)
