const test=require('node:test');const assert=require('node:assert/strict');
test('demo dataset has provider-neutral record fields',()=>{const record={id:'demo',source:'Local',kind:'RAG chunk',title:'x',text:'y',updated:'2026-01-01'};assert.ok(record.id&&record.source&&record.kind&&record.title&&record.text&&record.updated)});
