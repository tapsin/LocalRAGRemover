const { app, BrowserWindow, ipcMain, safeStorage, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const records = [
  { id: 'demo-001', source: 'Demo / Local JSON', kind: 'RAG chunk', title: 'Proje mimarisi notları', text: 'Electron ana süreç ve preload katmanı ayrılmalı.', tokens: 24, updated: '2026-09-26', size: '1.4 KB', selected: false, demo: true },
  { id: 'demo-002', source: 'Demo / SQLite', kind: 'Embedding', title: 'Eski sağlayıcı ayarları', text: 'Kullanılmayan provider endpoint yapılandırması.', tokens: 18, updated: '2026-08-12', size: '980 B', selected: false, demo: true },
  { id: 'demo-003', source: 'Demo / OpenAI-compatible', kind: 'Conversation memory', title: 'Test konuşması / 2025', text: 'Sentetik test kaydı — üretim verisi değildir.', tokens: 42, updated: '2025-12-03', size: '3.2 KB', selected: false, demo: true },
  { id: 'demo-004', source: 'Demo / Vector index', kind: 'Metadata', title: 'Boş metadata kaydı', text: 'İndeks içinde artık referansı olmayan metadata.', tokens: 6, updated: '2026-01-18', size: '240 B', selected: false, demo: true }
];
let openedFile = null;
let allowedFolder = null;
const supportedExtensions = new Set(['.txt','.md','.json','.jsonl','.csv','.log','.yaml','.yml','.xml','.sql','.gguf','.db','.sqlite','.sqlite3']);
function readTextPage(filePath, startLine=0, limit=1000) { const fd=fs.openSync(filePath,'r'); const chunk=Buffer.alloc(8*1024*1024); const read=fs.readSync(fd,chunk,0,chunk.length,0); fs.closeSync(fd); const all=chunk.toString('utf8',0,read).split(/\r?\n/); const lines=all.slice(startLine,startLine+limit); return {lines,startLine,totalBytes:fs.statSync(filePath).size,hasMore:all.length>startLine+limit}; }
function collectFiles(root) { const result=[]; for(const entry of fs.readdirSync(root,{withFileTypes:true})){ if(entry.name.startsWith('.')) continue; const full=path.join(root,entry.name); if(entry.isDirectory()) result.push(...collectFiles(full)); else if(supportedExtensions.has(path.extname(entry.name).toLowerCase())) result.push(full); } return result; }
function inspectSqlite(filePath) { const script=`import sqlite3,json,sys\np=sys.argv[1]\nc=sqlite3.connect(p)\nc.row_factory=sqlite3.Row\nout=[]\nfor (name,) in c.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name"):\n cols=[r[1] for r in c.execute(f'pragma table_info("{name}")')]\n rows=[dict(r) for r in c.execute(f'select * from "{name}" limit 500')]\n out.append({'table':name,'columns':cols,'rows':rows})\nprint(json.dumps(out,ensure_ascii=False,default=str))`; const result=spawnSync('python3',['-c',script,filePath],{encoding:'utf8',maxBuffer:20*1024*1024}); if(result.status!==0)throw new Error(result.stderr.trim()||'SQLite dosyası okunamadı.'); const tables=JSON.parse(result.stdout||'[]'); return {sqlite:true,path:filePath,name:path.basename(filePath),size:fs.statSync(filePath).size,tables,tableCount:tables.length}; }
function inspectPath(filePath) { const ext=path.extname(filePath).toLowerCase(); const stat=fs.statSync(filePath); if(['.db','.sqlite','.sqlite3'].includes(ext)) return inspectSqlite(filePath); if(ext==='.gguf') return { gguf:true, path:filePath, name:path.basename(filePath), ...parseGguf(filePath) }; if(stat.size>10*1024*1024) throw new Error('10 MB üzerindeki metin dosyaları şimdilik desteklenmiyor.'); const lines=fs.readFileSync(filePath,'utf8').split(/\r?\n/); const seen=new Map();let duplicateLines=0,emptyLines=0,sensitiveLines=0;lines.forEach((line,i)=>{const normalized=line.trim();if(!normalized)emptyLines++;const key=normalized.toLowerCase();if(key){if(seen.has(key))duplicateLines++;else seen.set(key,i)}if(/(?:sk-[A-Za-z0-9]{20,}|api[_-]?key|password|Bearer\s+[A-Za-z0-9._-]{12,}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?\d[\d ()-]{8,}\d))/.test(line))sensitiveLines++}); return { path:filePath,name:path.basename(filePath),size:stat.size,lines,encoding:'UTF-8',quality:{total:lines.length,empty:emptyLines,duplicates:duplicateLines,sensitive:sensitiveLines} }; }

function settingsPath() { return path.join(app.getPath('userData'), 'settings.json'); }
function readSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    let apiKey = '';
    if (saved.apiKey && saved.encrypted && safeStorage.isEncryptionAvailable()) apiKey = safeStorage.decryptString(Buffer.from(saved.apiKey, 'base64'));
    else if (saved.apiKey && !saved.encrypted) apiKey = saved.apiKey;
    return { endpoint: saved.endpoint || 'http://localhost:11434/v1', apiKey };
  } catch { return { endpoint: 'http://localhost:11434/v1', apiKey: '' }; }
}
function writeSettings({ endpoint, apiKey }) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  const encrypted = safeStorage.isEncryptionAvailable();
  const storedKey = encrypted ? safeStorage.encryptString(apiKey || '').toString('base64') : (apiKey || '');
  const target = settingsPath();
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, JSON.stringify({ endpoint: endpoint || '', apiKey: storedKey, encrypted, updatedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  fs.renameSync(temp, target);
  return { saved: true, encrypted, endpoint: endpoint || '', hasApiKey: Boolean(apiKey), location: target };
}
function readU64(buffer, offset) { return Number(buffer.readBigUInt64LE(offset)); }
function readGgufString(buffer, offset) { const length = readU64(buffer, offset); const start = offset + 8; return { value: buffer.toString('utf8', start, start + length), next: start + length }; }
function readGgufValue(buffer, offset, type) {
  const sizes = [1,1,2,2,4,4,4,1,0,0,8,8,8];
  if (type === 8) return readGgufString(buffer, offset);
  if (type === 9) { const subtype = buffer.readUInt32LE(offset); const count = readU64(buffer, offset + 4); let next = offset + 12; const values=[]; for(let i=0;i<Math.min(count,100);i++){const item=readGgufValue(buffer,next,subtype);values.push(item.value);next=item.next} return { value: count>100 ? `[${count} öğe]` : values, next }; }
  if (type === 7) return { value: Boolean(buffer.readUInt8(offset)), next: offset + 1 };
  if (type < 8) { const size=sizes[type]; const readers=[b=>b.readUInt8(offset),b=>b.readInt8(offset),b=>b.readUInt16LE(offset),b=>b.readInt16LE(offset),b=>b.readUInt32LE(offset),b=>b.readInt32LE(offset),b=>b.readFloatLE(offset)]; return { value: readers[type](buffer), next: offset+size }; }
  if (type === 10) return { value: readU64(buffer,offset), next: offset+8 };
  if (type === 11) return { value: Number(buffer.readBigInt64LE(offset)), next: offset+8 };
  if (type === 12) return { value: buffer.readDoubleLE(offset), next: offset+8 };
  throw new Error(`Desteklenmeyen GGUF metadata tipi: ${type}`);
}
function parseGguf(filePath) {
  const fd=fs.openSync(filePath,'r'); const header=Buffer.alloc(4*1024*1024); const read=fs.readSync(fd,header,0,header.length,0); fs.closeSync(fd); const buffer=header.subarray(0,read);
  if (buffer.toString('ascii',0,4)!=='GGUF') throw new Error('Geçersiz GGUF magic değeri.');
  const version=buffer.readUInt32LE(4); const tensors=readU64(buffer,8); const kvCount=readU64(buffer,16); let offset=24; const metadata=[];
  if(kvCount>10000) throw new Error('GGUF metadata başlığı geçersiz veya desteklenemeyecek kadar büyük.'); for(let i=0;i<kvCount;i++){if(offset+12>buffer.length)throw new Error('GGUF metadata başlığı eksik.');const key=readGgufString(buffer,offset);offset=key.next;const type=buffer.readUInt32LE(offset);offset+=4;const valueOffset=offset;const val=readGgufValue(buffer,offset,type);offset=val.next;metadata.push({key:key.value,value:Array.isArray(val.value)?val.value.join(', '):String(val.value),type,valueOffset})}
  const alignment=Number(metadata.find(x=>x.key==='general.alignment')?.value||32); offset=Math.ceil(offset/alignment)*alignment; const tensorList=[]; try { for(let i=0;i<Math.min(tensors,20000);i++){if(offset+12>buffer.length)break;const name=readGgufString(buffer,offset);if(name.next>buffer.length)break;offset=name.next;const dims=buffer.readUInt32LE(offset);offset+=4;if(dims>8||offset+(dims*8)+12>buffer.length)break;const shape=[];for(let d=0;d<dims;d++){shape.push(readU64(buffer,offset));offset+=8}const type=buffer.readUInt32LE(offset);offset+=4;const dataOffset=readU64(buffer,offset);offset+=8;tensorList.push({name:name.value,shape,type,dataOffset});} } catch (_tensorError) { /* Metadata remains usable when tensor table is truncated or uses an unsupported layout. */ }
  return {version,tensors,metadataCount:kvCount,metadata,tensorList,bytes:fs.statSync(filePath).size};
}
function updateGgufMetadata(filePath,key,value) { const info=parseGguf(filePath); const item=info.metadata.find(x=>x.key===key); if(!item) throw new Error('Metadata alanı bulunamadı.'); const fd=fs.openSync(filePath,'r+'); try { if([0,1,2,3,4,5,6,10,11,12].includes(item.type)){ const b=Buffer.alloc([0,1,2,2,4,4,4,0,0,0,8,8,8][item.type]); const n=Number(value); if(!Number.isFinite(n)) throw new Error('Sayısal metadata değeri geçersiz.'); if(item.type===0)b.writeUInt8(n);else if(item.type===1)b.writeInt8(n);else if(item.type===2)b.writeUInt16LE(n);else if(item.type===3)b.writeInt16LE(n);else if(item.type===4)b.writeUInt32LE(n);else if(item.type===5)b.writeInt32LE(n);else if(item.type===6)b.writeFloatLE(n);else if(item.type===10)b.writeBigUInt64LE(BigInt(Math.trunc(n)));else if(item.type===11)b.writeBigInt64LE(BigInt(Math.trunc(n)));else b.writeDoubleLE(n); fs.writeSync(fd,b,0,b.length,item.valueOffset); } else if(item.type===7){const b=Buffer.from(String(value).toLowerCase()==='true'?[1]:[0]);fs.writeSync(fd,b,0,1,item.valueOffset)} else throw new Error('Bu string/array alanı güvenli yerinde düzenleme için uygun değil.'); } finally { fs.closeSync(fd); } return {saved:true,key}; }

function createWindow() {
  const win = new BrowserWindow({ width: 1440, height: 920, minWidth: 1000, minHeight: 680, backgroundColor: '#0d1117', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
  win.loadFile(path.join(__dirname, '../src/index.html'));
}
app.whenReady().then(() => {
  ipcMain.handle('app:records', () => records);
  ipcMain.handle('app:scan', () => ({ count: records.length, scannedAt: new Date().toISOString() }));
  ipcMain.handle('app:delete', (_event, ids) => {
    const wanted = new Set(Array.isArray(ids) ? ids : []);
    let removed = 0;
    for (let i = records.length - 1; i >= 0; i--) if (wanted.has(records[i].id)) { records.splice(i, 1); removed++; }
    return { removed, remaining: records.length };
  });
  ipcMain.handle('app:settings', () => { const s = readSettings(); return { endpoint: s.endpoint, apiKey: s.apiKey ? '••••••••' : '', hasApiKey: Boolean(s.apiKey), encrypted: safeStorage.isEncryptionAvailable(), location: settingsPath() }; });
  ipcMain.handle('app:save-settings', (_event, settings) => { const current = readSettings(); const incoming = String(settings?.apiKey || ''); return writeSettings({ endpoint: String(settings?.endpoint || '').trim() || current.endpoint, apiKey: incoming || current.apiKey }); });
  ipcMain.handle('api:test', async () => { const settings=readSettings(); if(!settings.endpoint) throw new Error('Endpoint girilmemiş.'); const url=settings.endpoint.replace(/\/$/,'')+'/models'; const headers={}; if(settings.apiKey)headers.Authorization=`Bearer ${settings.apiKey}`; const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),8000); try { const response=await fetch(url,{headers,signal:controller.signal}); const body=await response.text(); if(!response.ok)throw new Error(`HTTP ${response.status}: ${body.slice(0,180)}`); let parsed={};try{parsed=JSON.parse(body)}catch{} const models=Array.isArray(parsed.data)?parsed.data.map(x=>x.id||x.name).filter(Boolean):[]; return {ok:true,url,models}; } catch(error) { throw new Error(error.name==='AbortError'?'Bağlantı zaman aşımına uğradı.':error.message); } finally { clearTimeout(timeout); } });
  ipcMain.handle('file:choose', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Metin ve veri dosyaları', extensions: ['txt', 'md', 'json', 'jsonl', 'csv', 'log', 'yaml', 'yml', 'xml', 'sql'] }, { name: 'SQLite index dosyası', extensions: ['db','sqlite','sqlite3'] }, { name: 'GGUF model dosyası', extensions: ['gguf'] }] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const filePath = result.filePaths[0];
    if (['.gguf','.db','.sqlite','.sqlite3'].includes(path.extname(filePath).toLowerCase())) { try { openedFile=filePath; const data=inspectPath(filePath); if(data.sqlite)data.lines=[]; return data; } catch(error) { return { canceled:true, error:`Kaynak okunamadı: ${error.message}` }; } }
    const stat = fs.statSync(filePath);
    openedFile = filePath;
    const page=readTextPage(filePath,0,1000);
    return { path: filePath, name: path.basename(filePath), size: stat.size, lines: page.lines, encoding: 'UTF-8', paged:true, hasMore:page.hasMore, startLine:0 };
  });
  ipcMain.handle('file:read-page', (_event,{startLine=0,limit=1000}={}) => { if(!openedFile)throw new Error('Açık dosya bulunamadı.'); const ext=path.extname(openedFile).toLowerCase(); if(['.gguf','.db','.sqlite','.sqlite3'].includes(ext))return {paged:false}; return readTextPage(openedFile,Number(startLine),Math.min(Number(limit)||1000,2000)); });
  ipcMain.handle('file:delete-lines', (_event, lineNumbers) => {
    if (!openedFile) throw new Error('Açık dosya bulunamadı.');
    const numbers = [...new Set((Array.isArray(lineNumbers) ? lineNumbers : []).map(Number).filter(Number.isInteger))].sort((a, b) => a - b);
    const original = fs.readFileSync(openedFile, 'utf8');
    const lines = original.split(/\r?\n/);
    const valid = numbers.filter(n => n >= 1 && n <= lines.length);
    if (!valid.length) return { removed: 0, path: openedFile };
    const backup = `${openedFile}.bak`;
    if (!fs.existsSync(backup)) fs.copyFileSync(openedFile, backup);
    const removeSet = new Set(valid);
    const updated = lines.filter((_line, index) => !removeSet.has(index + 1)).join('\n');
    fs.writeFileSync(openedFile, updated, 'utf8');
    return { removed: valid.length, path: openedFile, backup };
  });
  ipcMain.handle('file:export-clean', async (_event, lineNumbers) => { if(!openedFile) throw new Error('Açık dosya bulunamadı.'); const original=fs.readFileSync(openedFile,'utf8'); const lines=original.split(/\r?\n/); const removeSet=new Set((Array.isArray(lineNumbers)?lineNumbers:[]).map(Number)); const result=await dialog.showSaveDialog({defaultPath:path.join(path.dirname(openedFile),`${path.basename(openedFile,path.extname(openedFile))}.temiz${path.extname(openedFile)}`)}); if(result.canceled||!result.filePath)return {canceled:true}; fs.writeFileSync(result.filePath,lines.filter((_line,index)=>!removeSet.has(index+1)).join('\n'),'utf8'); return {saved:true,path:result.filePath}; });
  ipcMain.handle('file:read-open', () => { if (!openedFile) return { canceled: true }; return inspectPath(openedFile); });
  ipcMain.handle('file:choose-folder', async () => { const result=await dialog.showOpenDialog({properties:['openDirectory']}); if(result.canceled||!result.filePaths[0]) return {canceled:true}; allowedFolder=result.filePaths[0]; const files=collectFiles(allowedFolder); return {folder:allowedFolder,name:path.basename(allowedFolder),files:files.map(filePath=>({path:filePath,name:path.relative(allowedFolder,filePath),ext:path.extname(filePath).toLowerCase(),size:fs.statSync(filePath).size}))}; });
  ipcMain.handle('file:inspect-path', (_event,filePath) => { if(!allowedFolder||path.relative(allowedFolder,filePath).startsWith('..')) throw new Error('Bu dosya seçilen kaynak klasörünün dışında.'); openedFile=filePath; const data=inspectPath(filePath); if(data.sqlite)data.lines=[]; return data; });
  ipcMain.handle('file:update-gguf', (_event,{key,value}) => { if(!openedFile||path.extname(openedFile).toLowerCase()!=='.gguf') throw new Error('Açık GGUF dosyası yok.'); const backup=`${openedFile}.bak`; if(!fs.existsSync(backup))fs.copyFileSync(openedFile,backup); return updateGgufMetadata(openedFile,String(key),String(value)); });
  ipcMain.handle('sqlite:delete-row', (_event,{table,rowid}) => { if(!openedFile||!['.db','.sqlite','.sqlite3'].includes(path.extname(openedFile).toLowerCase())) throw new Error('Açık SQLite dosyası yok.'); if(!/^[A-Za-z0-9_ -]+$/.test(String(table))) throw new Error('Geçersiz tablo adı.'); const backup=`${openedFile}.bak`;if(!fs.existsSync(backup))fs.copyFileSync(openedFile,backup); const script=`import sqlite3,sys\np,table,rowid=sys.argv[1],sys.argv[2],int(sys.argv[3])\nc=sqlite3.connect(p)\nc.execute('delete from "'+table+'" where rowid=?',(rowid,))\nc.commit()\nprint(c.total_changes)`; const result=spawnSync('python3',['-c',script,openedFile,String(table),String(rowid)],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr.trim()||'SQLite satırı silinemedi.');return {removed:Number(result.stdout.trim()||0),backup}; });
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// SQLite inspection override: include rowids so the UI can target individual records safely.
function inspectSqlite(filePath) { const script=`import sqlite3,json,sys\np=sys.argv[1]\nc=sqlite3.connect(p)\nc.row_factory=sqlite3.Row\nout=[]\nfor (name,) in c.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name"):\n cols=[r[1] for r in c.execute(f'pragma table_info("{name}")')]\n try: rows=[dict(r) for r in c.execute(f'select rowid as __rowid__, * from "{name}" limit 500')]\n except sqlite3.OperationalError: rows=[dict(r) for r in c.execute(f'select * from "{name}" limit 500')]\n out.append({'table':name,'columns':cols,'rows':rows})\nprint(json.dumps(out,ensure_ascii=False,default=str))`; const result=spawnSync('python3',['-c',script,filePath],{encoding:'utf8',maxBuffer:20*1024*1024}); if(result.status!==0)throw new Error(result.stderr.trim()||'SQLite dosyası okunamadı.'); const tables=JSON.parse(result.stdout||'[]'); return {sqlite:true,path:filePath,name:path.basename(filePath),size:fs.statSync(filePath).size,tables,tableCount:tables.length}; }
