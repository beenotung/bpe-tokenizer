import { Network, Tensor, ad, nn, opt } from 'adnn.ts'
import { BPETokenizer } from '../core'
import { expand_onehot, token_size } from './skip-gram'

async function main() {
  let tokenizer = new BPETokenizer()
  tokenizer.fromJSON(require('./tokenizer.json'))
  tokenizer.compactVectorIndex()

  let net = Network.deserializeJSON(require('./wordnet.json'))

  let tokens = tokenizer.encodeToVector('cookie')
  for (let token of tokens) {
    let embedding = net.eval(
      new Tensor([token_size]).fromArray(expand_onehot(token)),
    )
    console.log(token, '->', embedding)
  }
}

main().catch(e => console.error(e))
