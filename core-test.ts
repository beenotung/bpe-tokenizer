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

  // to skip index on tokens without weights after merge
  tokenizer.compactVectorIndex()

  // save the tokenizer model to file
  writeFileSync(config_file, JSON.stringify(tokenizer))
} else {
  // load the tokenizer model from file
  tokenizer.fromJSON(JSON.parse(fs.readFileSync(config_file).toString()))
}

writeFileSync('tokens.json', JSON.stringify(tokenizer.token_table))

// encode into object array for extended usage
let tokens = tokenizer.encodeToTokens(content)

// encode into integer array for numeric operations
let vector = tokenizer.encodeToVector(content)

// you can decode from token or vector
let decoded_content_from_tokens = tokenizer.decodeTokens(tokens)
let decoded_content_from_vector = tokenizer.decodeVector(vector)

let used_tokens = tokenizer.token_table.filter(
  token => token.vector_index != null,
)

console.log({
  // content,
  // vector,
  content: content.length,
  vector: vector.length,
  ratio: vector.length / content.length,
  all_tokens: tokenizer.token_table.length,
  used_tokens: used_tokens.length,
  // tokens,
  // segments: tokens.map(token => token.chars),
  // decoded_content,
  match:
    content == decoded_content_from_tokens &&
    decoded_content_from_tokens == decoded_content_from_vector,
  token_char_length: used_tokens
    .slice()
    .reduce((acc, c) => {
      let item = acc.find(({ chars }) => chars == c.chars.length)
      if (item) {
        item.count++
      } else {
        acc.push({ chars: c.chars.length, count: 1 })
      }
      return acc
    }, [] as { chars: number; count: number }[])
    .sort((a, b) => a.chars - b.chars),
  weights: used_tokens
    .slice()
    .reduce((acc, c) => {
      let item = acc.find(({ weight }) => weight == c.weight)
      if (item) {
        item.count++
      } else {
        acc.push({ weight: c.weight, count: 1 })
      }
      return acc
    }, [] as { weight: number; count: number }[])
    .sort((a, b) => a.weight - b.weight),
  min: Math.min(...vector),
  max: Math.max(...vector),
})
