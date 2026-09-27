const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('text record deletion keeps a backup and removes only selected lines', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lrr-text-'));
  const file = path.join(dir, 'dataset.jsonl');
  fs.writeFileSync(file, '{"ok":1}\n{"bad":1}\n{"ok":2}\n');
  const original = fs.readFileSync(file, 'utf8');
  fs.copyFileSync(file, `${file}.bak`);
  fs.writeFileSync(file, original.split(/\r?\n/).filter((_line, i) => i !== 1).join('\n'));
  assert.match(fs.readFileSync(file, 'utf8'), /"ok":2/);
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /"bad":1/);
  assert.equal(fs.readFileSync(`${file}.bak`, 'utf8'), original);
});

test('sqlite row deletion removes one row and leaves a backup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lrr-sqlite-'));
  const file = path.join(dir, 'memory.sqlite');
  const create = spawnSync('python3', ['-c', "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('create table memory(id integer primary key, text text)'); c.executemany('insert into memory(text) values (?)',[('keep',),('remove',)]); c.commit()", file], { encoding: 'utf8' });
  assert.equal(create.status, 0, create.stderr);
  fs.copyFileSync(file, `${file}.bak`);
  const remove = spawnSync('python3', ['-c', "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('delete from memory where id=?',(2,)); c.commit()", file], { encoding: 'utf8' });
  assert.equal(remove.status, 0, remove.stderr);
  const check = spawnSync('python3', ['-c', "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); print(c.execute('select text from memory').fetchall())", file], { encoding: 'utf8' });
  assert.equal(check.stdout.trim(), "[('keep',)]");
  assert.ok(fs.statSync(`${file}.bak`).size > 0);
});
