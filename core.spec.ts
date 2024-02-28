import { expect } from 'chai'
import { BPETokenizer } from './core'

let content_abc = 'aaabdaaabac'
describe(`encode ${content_abc}`, () => {
  it(`should encode "${content_abc}" into segments "aaab d aaab a c"`, () => {
    // initial: "a a a b d a a a b a c"
    // merge "aa": "aa a b d aa a b a c"
    // merge "ab": "aa ab d aa ab a c"
    // merge "aaab": "aaab d aaab a c"
    let tokenizer = new BPETokenizer()
    tokenizer.addContent(content_abc)
    tokenizer.mergeUntil({ min_weight: 2 })
    expect(
      tokenizer
        .encodeToTokens(content_abc)
        .map(token => token.chars)
        .join(' '),
    ).to.deep.equal('aaab d aaab a c')
  })

  it(`should encode "${content_abc}" into vector [4 2 4 1 3]`, () => {
    /**
     * initial:
     * becomes: "a a a b d a a a b a c"
     * 0: _ x 2
     * 1: a x 7
     * 2: b x 2
     * 3: d x 1
     * 4: c x 1
     *
     * merge: a + a
     * becomes: "aa a b d aa a b a c"
     * 0: _ x 2
     * 1: a x 3
     * 2: b x 2
     * 3: d x 1
     * 4: c x 1
     * 5: aa x 2
     *
     * merge: a + b
     * 0: _ x 2
     * 1: a x 1
     * 2: b x 0
     * 3: d x 1
     * 4: c x 1
     * 5: aa x 2
     * 6: ab x 2
     *
     * merge: aa + ab
     * 0: _ x 2
     * 1: a x 1
     * 2: b x 0
     * 3: d x 1
     * 4: c x 1
     * 5: aa x 0
     * 6: ab x 0
     * 7: aaab x 2
     *
     * compact index:
     * 0 -> 0: _ x 2
     * 1 -> 1: a x 1
     *      2: b x 0
     * 2 -> 3: d x 1
     * 3 -> 4: c x 1
     *      5: aa x 0
     *      6: ab x 0
     * 4 -> 7: aaab x 2
     */
    let tokenizer = new BPETokenizer()
    tokenizer.addContent(content_abc)
    debugger
    tokenizer.mergeUntil({ min_weight: 2 })
    tokenizer.compactVectorIndex()
    // console.log({
    //   from_vector_index: tokenizer.from_vector_index,
    //   to_vector_index: tokenizer.to_vector_index,
    //   weight: tokenizer.token_table.map(s => [s.chars, s.weight]),
    // })
    expect(tokenizer.encodeToVector(content_abc)).to.deep.equal([4, 2, 4, 1, 3])
  })
})

let content_x = 'xxxxxxxxx'
describe(`encode ${content_x}`, () => {
  it.only(`should encode "${content_x}" into segments "xxxxxxxx x"`, () => {
    //           initial: "_ x x x x x x x x x _"
    //       merge x + x: "_ xx xx xx xx x _"
    //     merge xx + xx: "xxxx xxxx x"
    // merge xxxx + xxxx: "xxxxxxxx x"
    let tokenizer = new BPETokenizer()
    tokenizer.addContent(content_x)
    tokenizer.mergeUntil({ min_weight: 2 })
    console.log({
      from_vector_index: tokenizer.from_vector_index,
      to_vector_index: tokenizer.to_vector_index,
      weight: tokenizer.token_table.map(s => [s.chars, s.weight]),
    })
    expect(
      tokenizer
        .encodeToTokens(content_x)
        .map(token => token.chars)
        .join(' '),
    ).to.deep.equal('xxxxxxxx x')
  })

  it.skip(`should encode "${content_x}" into vector [4 2 4 1 3]`, () => {
    /**
     * initial:
     * becomes: "a a a b d a a a b a c"
     * 0: _ x 2
     * 1: a x 7
     * 2: b x 2
     * 3: d x 1
     * 4: c x 1
     *
     * merge: a + a
     * becomes: "aa a b d aa a b a c"
     * 0: _ x 2
     * 1: a x 3
     * 2: b x 2
     * 3: d x 1
     * 4: c x 1
     * 5: aa x 2
     *
     * merge: a + b
     * 0: _ x 2
     * 1: a x 1
     * 2: b x 0
     * 3: d x 1
     * 4: c x 1
     * 5: aa x 2
     * 6: ab x 2
     *
     * merge: aa + ab
     * 0: _ x 2
     * 1: a x 1
     * 2: b x 0
     * 3: d x 1
     * 4: c x 1
     * 5: aa x 0
     * 6: ab x 0
     * 7: aaab x 2
     *
     * compact index:
     * 0 -> 0: _ x 2
     * 1 -> 1: a x 1
     *      2: b x 0
     * 2 -> 3: d x 1
     * 3 -> 4: c x 1
     *      5: aa x 0
     *      6: ab x 0
     * 4 -> 7: aaab x 2
     */
    let tokenizer = new BPETokenizer()
    tokenizer.addContent(content_x)
    debugger
    tokenizer.mergeUntil({ min_weight: 2 })
    tokenizer.compactVectorIndex()
    // console.log({
    //   from_vector_index: tokenizer.from_vector_index,
    //   to_vector_index: tokenizer.to_vector_index,
    //   weight: tokenizer.token_table.map(s => [s.chars, s.weight]),
    // })
    expect(tokenizer.encodeToVector(content_x)).to.deep.equal([4, 2, 4, 1, 3])
  })
})
