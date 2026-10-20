'use strict';
/* Schwab Lab Design Archive — local-only OpenRocket file inspection and project saving. */
(()=>{
const $=id=>document.getElementById(id);
const keys=['wetMass','propMass','diameter','cd','impulse','burnTime'];
const uid=()=>typeof crypto.randomUUID==='function'?crypto.randomUUID():`local-${Date.now()}-${Math.random().toString(36).slice(2,12)}`;
let design=null,sourceFile=null,currentId=null,db=null;
function message(text,warn=false){$('statusMessage').textContent=text;$('statusMessage').classList.toggle('warn',warn)}
function values(){const v={};for(const k of keys){const el=$(k);const raw=el.value.trim();const num=Number(raw);if(raw&&(!Number.isFinite(num)||num<0||num>1e7))throw Error(`Invalid value in ${k}.`);v[k]=raw===''?null:num}return v}
function applyValues(v){for(const k of keys)$(k).value=v?.[k]??''}
function elt(parent,text,cl){const el=document.createElement('div');if(cl)el.className=cl;el.textContent=String(text);parent.append(el);return el}
function direct(el,tag){return Array.from(el?.children||[]).find(ch=>ch.localName===tag)}
function childText(el,tag){return direct(el,tag)?.textContent?.trim()||''}
function inspect(xml,files=[]){
  if(/<!doctype|<!entity/i.test(xml))throw Error('XML entities and DOCTYPE are not supported.');
  const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror'))throw Error('Invalid OpenRocket XML.');
  if(doc.documentElement.localName!=='openrocket')throw Error('The file is not an OpenRocket project.');
  const rocket=doc.getElementsByTagName('rocket')[0];if(!rocket)throw Error('OpenRocket design is missing its rocket definition.');
  const tags=new Set(['rocket','axialstage','parallelstage','podset','nosecone','bodytube','transition','trapezoidfinset','ellipticalfinset','freeformfinset','tubefinset','innerbodytube','innertube','centeringring','bulkhead','engineblock','parachute','streamer','shockcord','launchlug','railbutton','masscomponent','tubecoupler']);
  const stack=[{node:rocket,depth:0}],components=[];
  while(stack.length&&components.length<=350){const {node,depth}=stack.pop();const type=node.localName||node.tagName.toLowerCase();if(tags.has(type)){const l=Number(childText(node,'length'));components.push({type,name:childText(node,'name')||type,depth,length:Number.isFinite(l)&&childText(node,'length')!==''?l:null})}const children=direct(node,'subcomponents');if(children)Array.from(children.children).reverse().forEach(c=>stack.push({node:c,depth:depth+1}));}
  const motors=Array.from(doc.getElementsByTagName('motor')).filter(m=>childText(m,'designation')).slice(0,70).map(m=>({designation:childText(m,'designation'),manufacturer:childText(m,'manufacturer'),delay:childText(m,'delay')}));
  const simulations=Array.from(doc.getElementsByTagName('simulation')).slice(0,75).map((s,i)=>window.SchwabSimViewer.extract(s,i));
  return {name:childText(rocket,'name')||'Untitled design',format:doc.documentElement.getAttribute('version')||'unknown',creator:doc.documentElement.getAttribute('creator')||'',components,motors,simulations,entries:files.length};
}
function clearChildren(id){$(id).replaceChildren()}
function show(viewerState=null){
  for(const id of ['orkOverview','componentList','motorList','simList'])clearChildren(id);
  $('downloadOrk').disabled=!sourceFile;
  window.SchwabSimViewer.setDesign(design,viewerState);
  if(!design){$('orkOverview').className='ork-overview empty';$('orkOverview').textContent='Import a design to see its structure.';$('orkName').textContent='No design file loaded.';for(const id of ['componentCount','motorCount','simCount'])$(id).textContent='';return;}
  $('orkOverview').className='ork-overview';
  for(const [title,value] of [['Design',design.name],['OpenRocket version',design.format],['Creator',design.creator||'Unknown'],['Components',design.components.length],['Recorded motors',design.motors.length],['Saved simulations',design.simulations.length]]){
    const row=elt($('orkOverview'),'','line');elt(row,title);const strong=document.createElement('b');strong.textContent=value;row.append(strong);
  }
  $('componentCount').textContent=`(${design.components.length})`;$('motorCount').textContent=`(${design.motors.length})`;$('simCount').textContent=`(${design.simulations.length})`;
  for(const c of design.components){const row=elt($('componentList'),`${'· '.repeat(c.depth)}${c.name}`,'entry');elt(row,`${c.type}${c.length!==null?' · recorded length '+(c.length*1000).toFixed(1)+' mm':''}`,'subtle')}
  if(!design.motors.length)elt($('motorList'),'No motor metadata stored in this file.');
  for(const m of design.motors){const row=elt($('motorList'),`${m.manufacturer} ${m.designation}`,'entry');elt(row,`Recorded delay: ${m.delay||'not stated'} s`,'subtle')}
  if(!design.simulations.length)elt($('simList'),'No saved simulations in this design.');
  for(const s of design.simulations){const row=elt($('simList'),s.name,'entry');elt(row,`${s.status||'Status unknown'}${s.maxAltitude?' · saved peak altitude '+s.maxAltitude+' m':''}${s.flightTime?' · duration '+s.flightTime+' s':''}`,'subtle')}
}
async function readOrk(file){if(file.size>8e6)throw Error('8 MB maximum .ork import size.');const buf=await file.arrayBuffer();const u=new Uint8Array(buf);let xml,entries=[];
  if(u[0]===0x50&&u[1]===0x4b){if(!window.JSZip)throw Error('Local ZIP reader unavailable.');const zip=await JSZip.loadAsync(buf,{checkCRC32:true});entries=Object.keys(zip.files);if(entries.length>1000)throw Error('Too many archive entries.');const x=zip.file('rocket.ork')||zip.file(/(^|\/)rocket\.ork$/i)[0];if(!x)throw Error('The archive is missing rocket.ork.');if(x._data?.uncompressedSize>12e6)throw Error('XML is too large.');xml=await x.async('string');}
  else if(new TextDecoder().decode(u.slice(0,100)).trimStart().startsWith('<'))xml=new TextDecoder().decode(buf);
  else throw Error('Expected a ZIP-based .ork file or OpenRocket XML.');
  if(xml.length>12e6)throw Error('XML is too large.');return {design:inspect(xml,entries),bytes:u};
}
function toBase64(bytes){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Could not read file'));reader.readAsDataURL(new Blob([bytes]))})}
function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}
$('orkFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const result=await readOrk(file);design=result.design;sourceFile={name:file.name,mime:file.type||'application/octet-stream',base64:await toBase64(result.bytes)};$('orkName').textContent=file.name;show();message(`Inspected ${file.name}: ${design.components.length} components and ${design.simulations.length} saved simulations.`)}catch(err){message(err.message,true)}e.target.value=''});
$('downloadOrk').addEventListener('click',()=>{if(!sourceFile)return;try{const binary=atob(sourceFile.base64),b=new Uint8Array(binary.length);for(let i=0;i<b.length;i++)b[i]=binary.charCodeAt(i);download(new Blob([b],{type:sourceFile.mime}),sourceFile.name)}catch(err){message('Could not download the imported file.',true)}});
function snapshot(){return {schema:'schwab-lab-archive',version:1,id:currentId||uid(),name:$('projectName').value.trim().slice(0,80)||'Untitled experiment',savedAt:new Date().toISOString(),viewer:window.SchwabSimViewer.getState(),values:values(),notes:$('projectNotes').value.slice(0,1500),site:window.SchwabConditions.capture(),design,sourceFile}}
function restore(p){if(!p||p.schema!=='schwab-lab-archive'||p.version!==1)throw Error('Not a compatible Schwab Lab archive.');if(!p.values||typeof p.values!=='object')throw Error('Recorded parameter data is missing.');applyValues(p.values);window.SchwabConditions.restore(p.site||null);$('projectName').value=String(p.name||'Untitled experiment').slice(0,80);$('projectNotes').value=String(p.notes||'').slice(0,1500);currentId=p.id||uid();sourceFile=p.sourceFile||null;design=p.design||null;show(p.viewer||null);if(sourceFile)$('orkName').textContent=sourceFile.name;message('Project opened: '+$('projectName').value)}
function database(){return new Promise((resolve,reject)=>{if(!indexedDB)return reject(Error('Browser storage not supported'));const req=indexedDB.open('SchwabLabDesignArchive',1);req.onupgradeneeded=()=>req.result.createObjectStore('projects',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function save(p){db=db||await database();return new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(p);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
async function findAll(){db=db||await database();return new Promise((resolve,reject)=>{const req=db.transaction('projects','readonly').objectStore('projects').getAll();req.onsuccess=()=>resolve(req.result.sort((a,b)=>b.savedAt.localeCompare(a.savedAt)));req.onerror=()=>reject(req.error)})}
async function findOne(id){db=db||await database();return new Promise((resolve,reject)=>{const req=db.transaction('projects','readonly').objectStore('projects').get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function removeOne(id){db=db||await database();return new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
async function library(){clearChildren('savedList');try{const projects=await findAll();if(!projects.length){elt($('savedList'),'No saved projects in this browser.','subtle');return;}for(const p of projects){const card=elt($('savedList'),'','libitem'),info=elt(card,'');elt(info,p.name,'entry');elt(info,`${new Date(p.savedAt).toLocaleString()} · ${p.sourceFile?.name||'No .ork file'}`,'subtle');const buttons=elt(card,'','libbuttons');for(const [label,action] of [['Open',async()=>{restore(await findOne(p.id));scrollTo({top:0,behavior:'smooth'})}],['Delete',async()=>{if(!confirm('Delete this saved project from your browser?'))return;await removeOne(p.id);if(currentId===p.id)currentId=null;await library()}]]){const b=document.createElement('button');b.className='button';b.textContent=label;b.addEventListener('click',()=>action().catch(err=>message(err.message,true)));buttons.append(b)}}}catch(err){elt($('savedList'),'Browser storage is unavailable here. Export project files instead.','subtle')}}
$('saveProject').addEventListener('click',async()=>{try{const p=snapshot();await save(p);currentId=p.id;await library();message('Saved this project to your browser. Export a backup to keep it beyond browser resets.')}catch(err){message('Could not save to browser. You can still export a JSON backup.',true)}});
$('exportProject').addEventListener('click',()=>{try{const p=snapshot(),name=p.name.replace(/[^a-z0-9 _-]/gi,'').trim().replace(/\s+/g,'_').slice(0,50)||'experiment';download(new Blob([JSON.stringify(p,null,2)],{type:'application/json'}),name+'.schwab.json');message('Project exported. It includes your original .ork file when one was imported.')}catch(err){message(err.message,true)}});
$('openProjectFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>18e6)throw Error('Project file exceeds 18 MB limit.');restore(JSON.parse(await file.text()))}catch(err){message(err.message,true)}e.target.value=''});
$('newProject').addEventListener('click',()=>{currentId=null;design=null;sourceFile=null;applyValues({});window.SchwabConditions.restore(null);$('projectName').value='Untitled experiment';$('projectNotes').value='';show();message('New unsaved project ready.')});
show();library();['wetMass','propMass'].forEach(id=>$(id).addEventListener('input',()=>window.SchwabConditions.review()));window.SchwabConditions.review();window.__schwabArchiveTest={inspect,readOrk,snapshot,restore};
})();