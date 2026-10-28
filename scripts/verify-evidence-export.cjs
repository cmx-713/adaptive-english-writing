const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../services/writingEvidenceExport.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const downloads = []
let blobContent = ''
class FakeBlob {
  constructor(parts) { blobContent = parts.join('') }
}
const context = {
  exports: {},
  require(name) {
    if (name === './argumentativeCtrlRubric') return { isArgumentativeProcess: process => process.writing_mode === 'argumentative' }
    throw new Error(`Unexpected import ${name}`)
  },
  Blob: FakeBlob,
  URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
  document: {
    body: { appendChild: () => {} },
    createElement: () => ({ style: {}, click() { downloads.push({ filename: this.download, content: blobContent }) }, remove() {} }),
  },
  window: { setTimeout: callback => callback() },
  Date,
}
vm.runInNewContext(compiled, context)

const valid = {
  id: 'p1', user_id: 's1', topic: 'Story: A question?', writing_mode: 'narrative',
  inspiration_cards: [{ id: 'c1', dimension: '关键时刻与场景' }],
  user_ideas: { c1: 'I got lost.' },
  validation_results: { c1: { analysis: '缺少具体细节', conversation: [{ question: '当时看到了什么？', studentResponse: 'I saw a sign.', coachFeedback: '有了依据。' }] } },
  dimension_drafts: { c1: { dimension: '关键时刻与场景', draft: 'I saw a sign.', scaffoldData: { vocabulary: ['sign'] } } },
  assembled_essay: { bodyParagraphs: [{ draft: 'I saw a sign and found my way.' }] },
  essay_grade: { totalScore: 11, generalComment: '场景清楚，继续完善行动依据。' },
}
const malformed = {
  id: 'p2', user_id: 's1', topic: 'Old record', writing_mode: 'argumentative',
  inspiration_cards: { old: true }, user_ideas: [], validation_results: null,
  dimension_drafts: { first: null, second: { draft: 'Old draft', scaffoldData: { vocabulary: { word: 'wrong shape' } } } },
  assembled_essay: { bodyParagraphs: 'not an array' },
}
context.exports.downloadProcessEvidenceBundle([valid, malformed], [{ id: 's1', name: 'Student', class_name: 'Class' }], 'Class')
assert.equal(downloads.length, 1, 'one click must trigger exactly one download')
assert.match(downloads[0].filename, /\.md$/)
assert.match(downloads[0].content, /当时看到了什么？/)
assert.match(downloads[0].content, /I saw a sign and found my way/)
assert.match(downloads[0].content, /场景清楚，继续完善行动依据。/)
assert.match(downloads[0].content, /记录 2/)

context.exports.downloadProcessEvidenceJsonBundle([valid, malformed], [{ id: 's1' }], 'Class')
assert.equal(downloads.length, 2)
assert.equal(JSON.parse(downloads[1].content).records.length, 2)
console.log('历史过程证据导出检查通过')
