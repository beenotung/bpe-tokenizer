import { BPETokenizer } from './core'
import fs, { writeFileSync } from 'fs'

let tokenizer = new BPETokenizer()

let config_file = 'bpe-tokenizer.json'

// let content = 'aaabdaaabac'
let content = fs.readFileSync('core-test.ts').toString()

if (!fs.existsSync(config_file)) {
  // you can add this method multiple times to add more samples from application-specific corpus
  tokenizer.addContent(content)

  // you can set a higher threshold for the minimum number of occurrences
  tokenizer.mergeUntil({ min_weight: 2 })

  // save the tokenizer model to file
  writeFileSync(config_file, JSON.stringify(tokenizer))
} else {
  // load the tokenizer model from file
  tokenizer.fromJSON(JSON.parse(fs.readFileSync(config_file).toString()))
}

// encode into object array for extended usage
let tokens = tokenizer.encodeToTokens(content)

// encode into integer array for numeric operations
let vector = tokenizer.encodeToVector(content)

// you can decode from token or vector
let decoded_content = tokenizer.decodeTokens(tokens)
decoded_content = tokenizer.decodeVector(vector)

console.log({
  // content,
  // vector,
  content: content.length,
  vector: vector.length,
  ratio: vector.length / content.length,
  // tokens,
  segments: tokens.map(token => token.chars),
  // decoded_content,
  match: content == decoded_content,
})
