import { execSync } from 'child_process'
import { createReadStream, existsSync } from 'fs'
import { stream_lines } from '@beenotung/tslib/file-stream'

let file = 'data.txt'
let maxLines = 100000

if (!existsSync(file)) {
  execSync(`find $HOME | grep -v .git | head -n ${maxLines} > ${file}`)
}

export function count_corpus(): number {
  let count = execSync(`wc -l ${file}`)
    .toString()
    .trim()
    .split(' ')
    .map(s => +s)
    .find(s => s)
  if (!count) throw new Error('failed to count corpus')
  return count
}

export async function* load_corpus_list() {
  let stream = createReadStream(file)
  let id = 0
  for await (let content of stream_lines(stream)) {
    id++
    yield { id, content }
  }
}
