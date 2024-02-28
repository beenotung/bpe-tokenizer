import { BPETokenizer } from './core'
import fs from 'fs'

let tokenizer = new BPETokenizer()

let content = 'aaabdaaabac'
// content = fs.readFileSync('core-test.ts').toString()
tokenizer.addContent(content)

tokenizer.mergeUntil({ min_weight: 2 })

// let tokenizer = scanner.build()
// console.dir(tokenizer.token_trie, { depth: 20 })

let tokens = tokenizer.encodeToTokens(content)
let vector = tokens.map(token => token.index)

let decoded_content = tokenizer.decodeTokens(tokens)

console.log({
  content,
  vector,
  // content: content.length,
  // vector: vector.length,
  ratio: vector.length / content.length,
  tokens,
  // segments: tokens.map(token => token.chars),
  // decoded_content,
  match: content == decoded_content,
})
