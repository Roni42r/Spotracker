import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {mime,security} from './web.mjs';

const here = path => new URL(path,import.meta.url);
const files = Object.keys(mime);
const serialized = Object.fromEntries(await Promise.all(files.map(async path=>[path,(await readFile(here('./public'+path))).toString('base64')])));
await mkdir(here('./dist/server/public/'),{recursive:true});
await copyFile(here('./public/core.mjs'),here('./dist/server/public/core.mjs'));
await copyFile(here('./server.mjs'),here('./dist/server/server.mjs'));
await writeFile(here('./dist/server/index.js'),`import {api} from './server.mjs';
const assets=${JSON.stringify(serialized)};
const mime=${JSON.stringify(mime)};
const security=${JSON.stringify(security)};
export default {async fetch(request,env){
  const path=new URL(request.url).pathname;
  if (path.startsWith('/api/')) return api(request,env);
  const file=path==='/'?'/index.html':path;
  if (!Object.hasOwn(assets,file) || !['GET','HEAD'].includes(request.method)) return new Response('Nicht gefunden',{status:404});
  const bytes=request.method==='HEAD'?null:Uint8Array.from(atob(assets[file]),char=>char.charCodeAt(0));
  return new Response(bytes,{headers:{...security,'Content-Type':mime[file],'Cache-Control':'no-cache'}});
}};
`);
