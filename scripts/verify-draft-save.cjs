const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const row = { id: 'process-1', user_id: 'student-1', status: 'in_progress', dimension_drafts: {} };
const writes = [];
const fakeSupabase = {
  from(table) {
    assert.equal(table, 'wc_thinking_process');
    const query = {
      payload: null, id: null, owner: null, statuses: null, selected: false,
      update(payload) { this.payload = payload; return this; },
      eq(column, value) {
        if (column === 'id') this.id = value;
        if (column === 'user_id') this.owner = value;
        return this;
      },
      in(column, values) { if (column === 'status') this.statuses = values; return this; },
      select() { this.selected = true; return this; },
      async run() {
        const marker = this.payload.dimension_drafts?.marker || this.payload.status || 'other';
        writes.push(`start:${marker}`);
        if (marker === 'old') await new Promise(resolve => setTimeout(resolve, 25));
        const matches = this.id === row.id
          && (!this.owner || this.owner === row.user_id)
          && (!this.statuses || this.statuses.includes(row.status));
        if (matches) Object.assign(row, this.payload);
        writes.push(`end:${marker}`);
        return this.selected
          ? { data: matches ? { id: row.id, updated_at: '2026-10-28T00:00:00Z' } : null, error: null }
          : { error: null };
      },
      maybeSingle() { return this.run(); },
      then(resolve, reject) { return this.run().then(resolve, reject); },
    };
    return query;
  },
};

const source = fs.readFileSync('services/supabaseDataService.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const moduleStub = { exports: {} };
vm.runInNewContext(code, {
  module: moduleStub, exports: moduleStub.exports, console, Promise, Map, setTimeout,
  require: name => name === './supabaseClient'
    ? { supabase: fakeSupabase }
    : name === './argumentativeCtrlRubric' ? { isArgumentativeProcess: () => true } : require(name),
});

const { updateThinkingProcess, saveThinkingProcessDraftSnapshot, submitThinkingProcess } = moduleStub.exports;
const snapshot = {
  writing_mode: 'narrative', inspiration_cards: [], user_ideas: {}, validation_results: {},
  coaching_turns: {}, personalized_expansions: {}, dimension_drafts: { marker: 'new' },
  assembled_essay: null, argument_reflection: null, status: 'in_progress',
};

(async () => {
  const oldWrite = updateThinkingProcess(row.id, { dimension_drafts: { marker: 'old' } });
  const confirmedSave = saveThinkingProcessDraftSnapshot(row.id, row.user_id, snapshot);
  await Promise.all([oldWrite, confirmedSave]);
  assert.deepEqual(writes.slice(0, 4), ['start:old', 'end:old', 'start:new', 'end:new']);
  assert.equal(row.dimension_drafts.marker, 'new');

  const wrongOwner = await saveThinkingProcessDraftSnapshot(row.id, 'another-student', snapshot);
  assert.ok(wrongOwner.error);
  const submitted = await submitThinkingProcess(row.id, row.user_id, { ...snapshot });
  assert.equal(submitted.error, null);
  await updateThinkingProcess(row.id, { dimension_drafts: { marker: 'late' } });
  assert.equal(row.status, 'sent_to_grader');
  assert.equal(row.dimension_drafts.marker, 'new');
  console.log('draft save ordering and confirmation ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
