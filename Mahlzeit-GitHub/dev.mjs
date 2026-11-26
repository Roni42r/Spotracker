import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {api} from './server.mjs';
import {mime,security} from './web.mjs';

const port=Number(process.env.PORT||4173), host=process.env.HOST||'127.0.0.1';
createServer(async (incoming,outgoing)=>{
  try {
    const url=new URL(incoming.url,'http://'+incoming.headers.host);
    if (url.pathname.startsWith('/api/')) {
      const options={method:incoming.method,headers:incoming.headers};
      if (!['GET','HEAD'].includes(incoming.method)) Object.assign(options,{body:Readable.toWeb(incoming),duplex:'half'});
      const response=await api(new Request(url,options),process.env);
      outgoing.writeHead(response.status,Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const path=url.pathname==='/'?'/index.html':url.pathname;
    if (!(path in mime) || !['GET','HEAD'].includes(incoming.method)) {outgoing.writeHead(404).end();return;}
    const body=await readFile(new URL('./public'+path,import.meta.url));
    outgoing.writeHead(200,{...security,'Content-Type':mime[path],'Cache-Control':'no-cache'}).end(incoming.method==='HEAD'?undefined:body);
  } catch { outgoing.writeHead(500).end('Interner Fehler'); }
}).listen(port,host,()=>console.log('Mahlzeit läuft unter http://'+host+':'+port));
