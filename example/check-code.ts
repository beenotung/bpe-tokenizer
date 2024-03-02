import { startTimer } from '@beenotung/tslib/timer'
import { createProxy } from '../core-db/proxy'
import { db } from './db'

let proxy = createProxy({ db })
let timer = startTimer('check corpus')
timer.setEstimateProgress(proxy.corpus.length)
for (let corpus of proxy.corpus) {
  timer.tick()
  for (let code of corpus.content_code) {
    let num = code.codePointAt(0)!
    let hex = num.toString(16).toUpperCase()
    let rows = db.query(
      `select id from corpus where id = :id and content_code like :code`,
      { id: corpus.id, code: `%${code}%` },
    )
    if (rows.length != 1) {
      console.log({ code, num, hex, rows })
      throw new Error('corpus not found')
    }
  }
}
timer.end()
