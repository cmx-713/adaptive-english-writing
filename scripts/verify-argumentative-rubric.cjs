const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const sourcePath = path.join(__dirname, '..', 'services', 'argumentativeCtrlRubric.ts');
const js = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = new module.constructor(sourcePath, module);
loaded.filename = sourcePath;
loaded.paths = module.paths;
loaded._compile(js, sourcePath);
const { collectStudentEvidence, normalizeArgumentativeCtrlV2, isArgumentativeProcess } = loaded.exports;

const student = {
  topic: 'A campus policy',
  inspirationCards: [{ id: 'card1', dimension: 'Social' }],
  userIdeas: { card1: 'I think the policy helps students.' },
  validationResults: { card1: { conversation: [{ studentResponse: 'The survey only covered one class, so I should qualify the claim.' }] } },
  dimensionDrafts: { card1: { draft: 'The survey suggests the policy may help some students.' } },
  assembledEssay: { introduction: '', bodyParagraphs: [{ draft: 'The survey suggests the policy may help some students.' }], conclusion: '' },
  argumentReflection: { text: 'I narrowed my claim because the survey covered one class.', updatedAt: new Date().toISOString() },
};
const sources = collectStudentEvidence(student);
const raw = {
  dimensions: {
    argumentEvidence: { score: 8, evidenceStatus: 'sufficient', evidence: [{ source: 'initial_idea', cardId: 'card1', quote: 'the policy helps students' }], explanation: '有主张。' },
    reasoningConditions: { score: 8, evidenceStatus: 'sufficient', evidence: [{ source: 'student_answer', cardId: 'card1', quote: 'only covered one class' }], explanation: '注意适用范围。' },
    argumentRevision: { score: 9, evidenceStatus: 'sufficient', evidence: [{ source: 'student_reflection', quote: 'I narrowed my claim because the survey covered one class.' }], explanation: '说明了修改依据。' },
  }, overallComment: '过程可见。',
};
assert.equal(normalizeArgumentativeCtrlV2(raw, sources).total, 8.3);

const invented = structuredClone(raw);
invented.dimensions.argumentEvidence.evidence[0].quote = 'AI invented this evidence';
assert.equal(normalizeArgumentativeCtrlV2(invented, sources).dimensions.argumentEvidence.score, null);

const finalOnly = collectStudentEvidence({ ...student, userIdeas: {}, validationResults: {}, dimensionDrafts: {}, argumentReflection: null });
assert.equal(normalizeArgumentativeCtrlV2(raw, finalOnly).total, null);

const wrongRevisionSource = structuredClone(raw);
wrongRevisionSource.dimensions.argumentRevision.evidence = [{ source: 'student_final', quote: 'The survey suggests the policy may help some students.' }];
assert.equal(normalizeArgumentativeCtrlV2(wrongRevisionSource, sources).dimensions.argumentRevision.score, null);

assert.equal(isArgumentativeProcess({ writing_mode: 'narrative', inspiration_cards: student.inspirationCards }), false);
assert.equal(isArgumentativeProcess({ writing_mode: 'argumentative', inspiration_cards: [{ narrativeRole: 'scene' }] }), true);
assert.equal(isArgumentativeProcess({ writing_mode: null, inspiration_cards: [] }), null);
console.log('议论文量规证据边界检查通过');
