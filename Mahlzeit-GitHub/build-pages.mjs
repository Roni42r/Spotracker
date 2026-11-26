import {cp,readFile,writeFile} from 'node:fs/promises';

const source = new URL('./public/',import.meta.url);
const target = new URL('./docs/',import.meta.url);
await cp(source,target,{recursive:true});
const index = new URL('index.html',target);
const html = await readFile(index,'utf8');
await writeFile(index,html.replace('<html lang="de">','<html lang="de" data-mode="static">'));
await writeFile(new URL('.nojekyll',target),'');
