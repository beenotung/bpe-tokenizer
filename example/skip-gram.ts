import { startTimer } from '@beenotung/tslib/timer'
import { BPETokenizer, Token } from '../core'
import { count_corpus, load_corpus_list } from './sample-corpus'
import { Tensor, TrainingData, ad, nn, opt } from 'adnn.ts'
import { writeFileSync } from 'fs'

export let tokenizer = new BPETokenizer()
tokenizer.fromJSON(require('./tokenizer.json'))
tokenizer.compactVectorIndex()

export let token_size = tokenizer.token_table.length
export let embedding_size = 50

let window_size = 2

export function expand_onehot(index: number) {
  let vector = new Array<number>(token_size).fill(0)
  vector[index] = 1
  return vector
}

async function main() {
  let timer = startTimer('init')

  timer.next('load corpus')
  timer.setEstimateProgress(count_corpus())
  let trainingData: TrainingData = []
  for await (let corpus of load_corpus_list()) {
    let tokens = tokenizer.encodeToVector(corpus.content)
    for (let i = 0; i < tokens.length; i++) {
      let target = tokens[i]
      for (
        let j = i - window_size;
        j <= i + window_size && j < tokens.length;
        j++
      ) {
        if (j < 0 || j == i) {
          continue
        }
        let context = tokens[j]
        // dataset.push([target, context])
        trainingData.push({
          input: new Tensor([token_size]).fromArray(expand_onehot(target)),
          output: context,
        })
      }
    }
    timer.tick()
  }

  timer.next('train network')

  let net = nn.sequence([
    nn.linear(token_size, embedding_size),
    nn.linear(embedding_size, token_size),
    nn.softmax,
  ])

  opt.nnTrain(net, trainingData, opt.classificationLoss, {
    batchSize: 10,
    iterations: 100,
    method: opt.adam,
  })

  timer.next('save network')
  let sampleJSON = {
    type: 'sequence',
    name: 'sequenceNetwork',
    networks: [
      {
        type: 'linear',
        name: 'linear',
        inSize: 1198,
        outSize: 50,
        weights: [1, 2],
        biases: [1],
      },
      {
        type: 'linear',
        name: 'linear',
        inSize: 50,
        outSize: 1198,
        weights: [1, 2],
        biases: [1],
      },
      { type: 'softmax' },
    ],
  }
  let netJSON = net.serializeJSON() as typeof sampleJSON
  netJSON.networks.pop()
  netJSON.networks.pop()
  writeFileSync('wordnet.json', JSON.stringify(netJSON))

  timer.end()
}

if (process.argv[2] == __filename) {
  main().catch(e => console.error(e))
}
