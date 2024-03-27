import { execSync } from 'child_process'
import { createReadStream, existsSync } from 'fs'
import { stream_lines } from '@beenotung/tslib/file-stream'

let file = 'data.txt'
let maxLines = 10000

if (!existsSync(file)) {
  // skip hash-like filenames
  execSync(`find $HOME -type f \
  | grep -v .git \
  | grep -v .cache \
  | grep -v .dartServer \
  | grep -v .zoom \
  | grep -v .gnome \
  | grep -v .keras \
  | grep -v .ipfs \
  | grep -v .mozilla \
  | grep -v postgresql \
  | grep -v history \
  | head -n ${maxLines} > ${file}`)
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
  for await (let file of stream_lines(stream)) {
    let parts = file.split('/')
    let filename = parts.pop()
    for (let dirname of parts) {
      id++
      yield { id, content: dirname + '/' }
    }
    id++
    yield { id, content: filename + '\n' }
  }
}
