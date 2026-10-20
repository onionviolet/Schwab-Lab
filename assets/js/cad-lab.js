'use strict';
/* Schwab Lab: read-only mesh and component-file archive. Never generates manufacturable geometry or control outputs. */
(()=>{
const $=id=>document.getElementById(id), status=$('cadStatus');
const MAX_BYTES=8_000_000,MAX_TRI=250_000,DISPLAY_LIMIT=5000;
let current=null, db=null, yaw=.55,pitch=.35,zoom=1,dragging=false,px=0,py=0;
const canvas=$('cadCanvas'),ctx=canvas.getContext('2d');
function notify(s,warn=false){status.textContent=s;status.classList.toggle('warn',warn)}
const unique=()=>crypto?.randomUUID?.()||`cad-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clean=s=>String(s??'').slice(0,3000);
function compact(n){return Number.isFinite(n)?n.toFixed(2):'—'}
function getMeta(){return {name:$('cadName').value.trim().slice(0,100)||'Untitled CAD reference',category:$('cadCategory').value,revision:$('cadRevision').value.trim().slice(0,24),project:$('cadProject').value.trim().slice(0,60),notes:$('cadNotes').value.slice(0,3000),units:$('cadUnits').value}};
function setMeta(p){$('cadName').value=p.name||'Untitled CAD reference';$('cadCategory').value=['reference','display','fit','other'].includes(p.category)?p.category:'reference';$('cadRevision').value=p.revision||'v1';$('cadProject').value=p.project||'';$('cadNotes').value=p.notes||'';$('cadUnits').value=['mm','cm','m','in'].includes(p.units)?p.units:'mm'}
function toB64(file){return new Promise((res,rej)=>{const f=new FileReader();f.onload=()=>res(String(f.result).split(',')[1]);f.onerror=()=>rej(Error('Unable to read file'));f.readAsDataURL(file)})}
function fromB64(b64){const bin=atob(b64),b=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)b[i]=bin.charCodeAt(i);return b}
function download(data,name,mime){const b=data instanceof Blob?data:new Blob([data],{type:mime||'application/octet-stream'});const url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200)}
function checkCoord(v){if(!Number.isFinite(v)||Math.abs(v)>1e8)throw Error('Model contains invalid or extremely large coordinates.');return v}
function binaryStl(buffer,count){const data=new DataView(buffer),out=new Float32Array(count*9);let c=0,off=84;for(let i=0;i<count;i++){for(let j=0;j<9;j++)out[c++]=checkCoord(data.getFloat32(off+12+j*4,true));off+=50}return out}
function asciiStl(text){const coords=[],pattern=/\bvertex\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)/gi;let match;while((match=pattern.exec(text))!==null){coords.push(checkCoord(+match[1]),checkCoord(+match[2]),checkCoord(+match[3]));if(coords.length>MAX_TRI*9)throw Error('Model has too many triangles.');}if(coords.length<9||coords.length%9!==0)throw Error('No complete STL triangles found.');return Float32Array.from(coords)}
function parseObj(text){const vertices=[],coords=[],lines=text.split(/\r?\n/);for(const line of lines){const q=line.trim();if(q.startsWith('v ')){const a=q.split(/\s+/);if(a.length<4)continue;vertices.push([checkCoord(+a[1]),checkCoord(+a[2]),checkCoord(+a[3])]);if(vertices.length>MAX_TRI*3)throw Error('Too many OBJ vertices.')}else if(q.startsWith('f ')){const specs=q.slice(2).trim().split(/\s+/);const indices=specs.map(v=>{const n=parseInt(v.split('/')[0],10);if(!Number.isFinite(n)||!n)throw Error('Invalid OBJ face index.');return n<0?vertices.length+n:n-1});for(let j=1;j<indices.length-1;j++){for(const k of [indices[0],indices[j],indices[j+1]]){if(k<0||k>=vertices.length)throw Error('OBJ face references a missing vertex.');coords.push(...vertices[k]);}if(coords.length>MAX_TRI*9)throw Error('Model has too many faces.')}}}if(!coords.length)throw Error('OBJ has no triangulatable faces.');return Float32Array.from(coords)}
async function parse3mf(buffer){if(!window.JSZip)throw Error('3MF ZIP library not available.');const zip=await JSZip.loadAsync(buffer,{checkCRC32:true});const entries=Object.values(zip.files);if(entries.length>500)throw Error('3MF contains too many entries.');const model=entries.find(x=>/3D\/.+\.model$/i.test(x.name)||x.name.toLowerCase()==='3d/3dmodel.model');if(!model)throw Error('No 3D model XML in this 3MF.');if(model._data?.uncompressedSize>12_000_000)throw Error('Model XML is too large.');const xml=await model.async('string');if(xml.length>12_000_000||/<!doctype|<!entity/i.test(xml))throw Error('Unsupported 3MF XML.');const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror'))throw Error('Invalid 3MF XML.');const root=doc.documentElement;if(root.localName!=='model')throw Error('Not a 3MF model document.');const unit=root.getAttribute('unit')||'millimeter';const factor={micron:.001,millimeter:1,centimeter:10,meter:1000,inch:25.4,foot:304.8}[unit];if(!factor)throw Error('Unsupported 3MF unit.');const obj=Array.from(doc.getElementsByTagName('*')).find(n=>n.localName==='object'&&Array.from(n.children).some(c=>c.localName==='mesh'));if(!obj)throw Error('3MF does not contain a basic triangular mesh; component assemblies are not supported.');const mesh=Array.from(obj.children).find(n=>n.localName==='mesh'),vt=Array.from(mesh.getElementsByTagName('*')).filter(n=>n.localName==='vertex'),faces=Array.from(mesh.getElementsByTagName('*')).filter(n=>n.localName==='triangle');if(vt.length>MAX_TRI*3||faces.length>MAX_TRI)throw Error('Model exceeds triangle limits.');const verts=vt.map(n=>['x','y','z'].map(k=>checkCoord(Number(n.getAttribute(k)))*factor)),coords=[];for(const face of faces){for(const k of ['v1','v2','v3']){const i=Number(face.getAttribute(k));if(!Number.isInteger(i)||i<0||i>=verts.length)throw Error('3MF triangle references an invalid vertex.');coords.push(...verts[i]);}}if(coords.length<9)throw Error('No 3MF triangles found.');const multi=doc.getElementsByTagName('*');const objectCount=Array.from(multi).filter(e=>e.localName==='object').length,buildCount=Array.from(multi).filter(e=>e.localName==='item').length;return {coords:Float32Array.from(coords),factor:1,note:objectCount>1||buildCount>1?'Preview shows the first basic mesh only; assembly transforms and extra objects were not applied.':'3MF model units converted to mm.'};}

/* OpenRocket .ork support: inspect component hierarchy, preserve original,
   and show a NON-MANUFACTURABLE reference diagram. No geometry generation. */
async function parseOrk(file, buffer){
  const bytes=new Uint8Array(buffer);
  let xml;
  if(bytes[0]===0x50&&bytes[1]===0x4b){
    if(!window.JSZip)throw Error('OpenRocket ZIP support is unavailable.');
    const zip=await JSZip.loadAsync(buffer,{checkCRC32:true});
    const entries=Object.values(zip.files);
    if(entries.length>500)throw Error('The OpenRocket archive contains too many entries.');
    const candidate=entries.find(e=>!e.dir&&/(^|\/)rocket\.ork$/i.test(e.name));
    if(!candidate)throw Error('This archive is missing rocket.ork.');
    if(candidate._data?.uncompressedSize>8_000_000)throw Error('The OpenRocket XML is too large.');
    xml=await candidate.async('string');
  }else{
    xml=new TextDecoder('utf-8',{fatal:true}).decode(buffer);
  }
  if(xml.length>8_000_000||/<!doctype|<!entity/i.test(xml))throw Error('Unsupported OpenRocket XML.');
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  if(doc.querySelector('parsererror')||doc.documentElement.localName!=='openrocket')throw Error('This is not a valid OpenRocket design.');
  const rocket=Array.from(doc.getElementsByTagName('*')).find(e=>e.localName==='rocket');
  if(!rocket)throw Error('OpenRocket design contains no rocket definition.');
  const direct=(node,name)=>Array.from(node.children).find(c=>c.localName===name);
  const value=(node,name)=>direct(node,name)?.textContent?.trim()||'';
  const meterValue=(node,keys)=>{
    for(const key of keys){
      const raw=value(node,key);
      if(!raw||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(raw))continue;
      const n=Number(raw);
      if(Number.isFinite(n)&&n>=0&&n<=1000)return n*1000;
    }
    return null;
  };
  const allowed=new Set(['rocket','axialstage','parallelstage','podset','nosecone','bodytube','transition','trapezoidfinset','ellipticalfinset','freeformfinset','tubefinset','innerbodytube','innertube','centeringring','bulkhead','engineblock','parachute','streamer','shockcord','launchlug','railbutton','masscomponent','tubecoupler']);
  const components=[], stack=[{node:rocket,depth:0}];
  while(stack.length&&components.length<350){
    const {node,depth}=stack.pop(),type=node.localName;
    if(allowed.has(type)){
      components.push({
        type,depth,name:value(node,'name').slice(0,110)||type,
        lengthMm:meterValue(node,['length','rootchord','foreShoulderLength']),
        radiusMm:meterValue(node,['outerradius','aftradius','radius','foreradius'])
      });
    }
    const children=direct(node,'subcomponents');
    if(children)Array.from(children.children).reverse().forEach(child=>stack.push({node:child,depth:Math.min(20,depth+1)}));
  }
  if(!components.length)throw Error('No supported OpenRocket components were found.');
  return {
    name:file.name,type:'ork',rocketName:value(rocket,'name').slice(0,150)||file.name,
    components,triangles:0,coords:0,rawCoords:null,
    min:[0,0,0],max:[0,0,0],dimensions:[NaN,NaN,NaN],
    originalSize:file.size,baseFactor:1,
    note:'OpenRocket reference only. Hierarchy and selected recorded dimensions are shown. Relative placement, surface geometry, wall thickness, component connections, and printability are not reconstructed.'
  };
}
function drawOrkReference(ctx,w,h,model){
  ctx.textAlign='left';
  ctx.fillStyle='#d7f9f4';ctx.font='bold 15px system-ui';
  ctx.fillText('OPENROCKET DESIGN REFERENCE',20,35);
  ctx.fillStyle='#a9c6d2';ctx.font='12px system-ui';
  ctx.fillText((model.rocketName||'Untitled').slice(0,48),20,58);
  ctx.fillStyle='#83abb9';ctx.font='11px system-ui';
  ctx.fillText('Component hierarchy • diagram only • NOT TO SCALE',20,78);
  const shown=Math.max(1,Math.floor((h-120)/25)),count=Math.min(shown,model.components.length);
  const yy=101;
  for(let i=0;i<count;i++){
    const c=model.components[i],x=25+Math.min(12,c.depth)*18,y=yy+i*25;
    ctx.strokeStyle='#4e9e9d';ctx.lineWidth=1.3;
    if(c.depth){ctx.beginPath();ctx.moveTo(x-12,y-11);ctx.lineTo(x-12,y+4);ctx.lineTo(x-3,y+4);ctx.stroke()}
    ctx.fillStyle=i%2?'#bad5de':'#64decc';ctx.beginPath();ctx.arc(x,y+4,3,0,Math.PI*2);ctx.fill();
    ctx.font='12px system-ui';ctx.fillStyle='#e1eef4';
    const length=c.lengthMm===null?'':(' • L '+c.lengthMm.toFixed(1)+' mm');
    ctx.fillText((c.name+' ('+c.type+')'+length).slice(0,100),x+11,y+8,Math.max(100,w-x-28));
  }
  if(model.components.length>count){ctx.fillStyle='#94aebc';ctx.font='11px system-ui';ctx.fillText('+'+(model.components.length-count)+' more components in Findings below',20,h-16)}
}

async function parse(file){if(!/\.(stl|obj|3mf|ork)$/i.test(file.name))throw Error('Choose a .stl, .obj, .3mf or .ork file.');if(file.size>MAX_BYTES)throw Error('8 MB maximum file size.');const ext=file.name.split('.').pop().toLowerCase(),buf=await file.arrayBuffer();let coords,note='';if(ext==='ork')return parseOrk(file,buf);if(ext==='3mf'){({coords,note}=await parse3mf(buf));}else if(ext==='obj'){coords=parseObj(await file.text());note='OBJ coordinates are unitless. Check the original authoring units.';}else{const u=new DataView(buf),count=buf.byteLength>=84?u.getUint32(80,true):0;if(count>MAX_TRI)throw Error('STL triangle count exceeds limit.');coords=buf.byteLength>=84&&buf.byteLength===84+count*50?binaryStl(buf,count):asciiStl(await file.text());note='STL coordinates are unitless. Check the original authoring units.';}
const base=ext==='3mf'?1:{mm:1,cm:10,m:1000,in:25.4}[$('cadUnits').value]||1;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let j=0;j<coords.length;j++){const axis=j%3,v=checkCoord(coords[j])*base;min[axis]=Math.min(min[axis],v);max[axis]=Math.max(max[axis],v)}const dimensions=min.map((v,i)=>max[i]-v);if(!dimensions.every(Number.isFinite))throw Error('Invalid model bounds.');return {name:file.name,type:ext,coords:coords.length,triangles:coords.length/9,min,max,dimensions,note,rawCoords:coords,originalSize:file.size,baseFactor:base};}
function setCurrent(model,filename,base64){current={id:current?.id||unique(),parsed:model,source:{name:filename,base64},savedAt:null};$('cadOriginal').disabled=false;$('cadExport').disabled=false;renderAll();}
function metric(text,id){$(id).textContent=text}
function renderAll(){if(!current){for(const id of ['dimX','dimY','dimZ','cadTriangles'])metric('—',id);$('cadFindings').textContent='No model selected.';$('cadOriginal').disabled=$('cadExport').disabled=true;draw();fitCheck();return}
 const m=current.parsed;if(m.type==='ork'){for(const id of ['dimX','dimY','dimZ'])metric('N/A',id);metric('Reference','cadTriangles');$('cadFindings').replaceChildren();for(const t of [m.rocketName+' · OpenRocket design',m.note,'Components: '+m.components.length]){const p=document.createElement('p');p.textContent=t;$('cadFindings').append(p)}for(const c of m.components){const p=document.createElement('p');p.textContent='  '.repeat(Math.min(c.depth,10))+c.name+' ['+c.type+']'+(c.lengthMm===null?'':' · length '+c.lengthMm.toFixed(1)+' mm')+(c.radiusMm===null?'':' · radius '+c.radiusMm.toFixed(1)+' mm');$('cadFindings').append(p)}fitCheck();draw();return;}['X','Y','Z'].forEach((name,i)=>metric(`${compact(m.dimensions[i])} mm`,'dim'+name));metric(m.triangles.toLocaleString(),'cadTriangles');$('cadFindings').replaceChildren();for(const str of [`Imported: ${m.name} · ${m.type.toUpperCase()} · ${(m.originalSize/1024).toFixed(1)} KB`, `Geometry: ${m.triangles.toLocaleString()} triangles. Only finite numeric vertices were accepted.`,m.note,`Bounding-box dimensions reflect coordinate extents, not mesh solidity, manufacturability or material strength.`]){const p=document.createElement('p');p.textContent=str;$('cadFindings').append(p)}fitCheck();draw();}
function fitCheck(){const out=$('bedFinding');if(!current){out.textContent='Import a model to compare its size with your printer dimensions.';out.className='cad-fit';return}if(current.parsed.type==='ork'){out.textContent='OpenRocket components are shown as a reference hierarchy, not a printable mesh. Build-volume comparison is unavailable.';out.className='cad-fit';return}const dims=['bedX','bedY','bedZ'].map(x=>$(x).value.trim()===''?null:Number($(x).value));if(dims.some(v=>v===null)){out.textContent='Enter all three usable printer dimensions to compare bounding boxes.';out.className='cad-fit';return}if(dims.some(n=>!Number.isFinite(n)||n<=0||n>2000)){out.textContent='Build-volume dimensions must be positive and at most 2,000 mm.';out.className='cad-fit warn';return}const d=current.parsed.dimensions,orders=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]],possible=orders.some(o=>o.every((v,i)=>d[v]<=dims[i]+1e-7));out.textContent=possible?'The imported size envelope fits these entered dimensions in at least one axis-aligned orientation. This does NOT assess support, safety, toolpaths or print success.':'The imported size envelope exceeds the entered dimensions in every axis-aligned orientation. Check scale and printer documentation.';out.className='cad-fit '+(possible?'good':'warn');}
function project3(v,w,h){const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);let x=v[0]*cy-v[1]*sy,y=v[0]*sy+v[1]*cy,z=v[2];const pY=y*cp-z*sp,pZ=y*sp+z*cp;const scale=Math.min(w,h)*.72*zoom;return [w/2+x*scale,h/2-pY*scale,pZ]}
function draw(){const rect=canvas.getBoundingClientRect();const ratio=Math.min(2,devicePixelRatio||1),w=Math.max(320,rect.width||650),h=Math.max(220,rect.height||470);canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
 ctx.strokeStyle='#244557';ctx.lineWidth=.75;for(let i=-6;i<=6;i++){const o=w/2+i*32;ctx.beginPath();ctx.moveTo(o,0);ctx.lineTo(o,h);ctx.stroke();ctx.beginPath();ctx.moveTo(0,h/2+i*32);ctx.lineTo(w,h/2+i*32);ctx.stroke()}
 if(current?.parsed?.type==='ork'){drawOrkReference(ctx,w,h,current.parsed);return;}if(!current?.parsed?.rawCoords){ctx.textAlign='center';ctx.fillStyle='#a7c7d1';ctx.font='14px system-ui';ctx.fillText('Import STL, OBJ or 3MF to inspect geometry',w/2,h/2);return}
 const m=current.parsed,raw=m.rawCoords,center=m.min.map((v,i)=>(v+m.max[i])/2),radius=Math.max(...m.dimensions,1e-4),tris=[];const count=raw.length/9,step=Math.max(1,Math.ceil(count/DISPLAY_LIMIT));for(let i=0;i<count;i+=step){const pts=[];for(let j=0;j<3;j++){const q=[0,1,2].map(k=>(raw[i*9+j*3+k]*m.baseFactor-center[k])/radius);pts.push(project3(q,w,h))}const ax=pts[1][0]-pts[0][0],ay=pts[1][1]-pts[0][1],bx=pts[2][0]-pts[0][0],by=pts[2][1]-pts[0][1];const area=ax*by-ay*bx;if(Math.abs(area)<.1)continue;tris.push({pts,z:pts.reduce((s,p)=>s+p[2],0)/3,light:Math.max(.1,Math.min(1,.36+Math.abs(area)/(w*h)*1000))});}tris.sort((a,b)=>a.z-b.z);const wire=$('cadWire').checked;for(const t of tris){ctx.beginPath();ctx.moveTo(t.pts[0][0],t.pts[0][1]);ctx.lineTo(t.pts[1][0],t.pts[1][1]);ctx.lineTo(t.pts[2][0],t.pts[2][1]);ctx.closePath();ctx.fillStyle=wire?'rgba(8,25,37,.06)':`rgba(82,214,206,${Math.min(.84,.19+t.light*.47)})`;ctx.fill();ctx.strokeStyle=wire?'rgba(144,235,229,.62)':'rgba(135,232,232,.19)';ctx.lineWidth=wire?.8:.55;ctx.stroke()}ctx.fillStyle='#a2cad6';ctx.font='11px system-ui';ctx.textAlign='left';ctx.fillText(`Preview ${tris.length.toLocaleString()} / ${count.toLocaleString()} triangles · geometry only`,12,h-13)}
const readSavedRecord=async p=>{if(!p||p.schema!=='schwab-cad-v1'||!p.source?.base64||!p.source.name||!p.meta||typeof p.meta!=='object')throw Error('Invalid or unsupported CAD archive.');if(p.source.base64.length>12e6)throw Error('Record is too large.');const bytes=fromB64(p.source.base64);const file=new File([bytes],p.source.name);setMeta(p.meta);const mesh=await parse(file);current={id:p.id||unique(),parsed:mesh,source:p.source,savedAt:p.savedAt||null};renderAll();notify(`Opened CAD reference: ${mesh.name}`)};
async function dbOpen(){if(db)return db;db=await new Promise((resolve,reject)=>{const r=indexedDB.open('SchwabLabCadLibrary',1);r.onupgradeneeded=()=>r.result.createObjectStore('models',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});return db}
async function transaction(mode,operation){const db=await dbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction('models',mode),req=operation(tx.objectStore('models'));req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function refresh(){const el=$('cadLibrary');el.replaceChildren();let records=[];try{records=await transaction('readonly',s=>s.getAll())}catch(e){el.textContent='Local storage unavailable. You can still export a portable record.';return}const q=$('cadSearch').value.trim().toLowerCase();records.sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt)));records=records.filter(r=>[r.meta?.name,r.meta?.project,r.meta?.category,r.meta?.revision,r.source?.name].join(' ').toLowerCase().includes(q));if(!records.length){el.textContent='No matching models stored in this browser.';return}for(const p of records){const entry=document.createElement('div');entry.className='cad-entry';const info=document.createElement('div'),name=document.createElement('b'),note=document.createElement('small');name.textContent=p.meta?.name||'Untitled';note.textContent=`${p.meta?.category||'reference'} · ${p.meta?.project||'No project'} · ${p.source?.name||'Source missing'} · ${new Date(p.savedAt).toLocaleDateString()}`;info.append(name,note);entry.append(info);const btns=document.createElement('div');btns.className='cad-entry-actions';for(const [label,fun] of [['Open',async()=>readSavedRecord(p)],['Export',async()=>download(JSON.stringify(p,null,2),(p.meta?.name||'model').replace(/[^a-z0-9-_]/gi,'_').slice(0,70)+'.schwabcad.json','application/json')],['Delete',async()=>{if(!confirm('Delete this saved CAD reference from this browser?'))return;await transaction('readwrite',s=>s.delete(p.id));await refresh()}]]){const b=document.createElement('button');b.className='button';b.textContent=label;b.addEventListener('click',()=>fun().catch(e=>notify(e.message,true)));btns.append(b)}entry.append(btns);el.append(entry)}}
function snapshot(){if(!current)throw Error('Import or open a model first.');const record={schema:'schwab-cad-v1',version:1,id:current.id||unique(),meta:getMeta(),source:current.source,savedAt:new Date().toISOString()};if(JSON.stringify(record).length>15e6)throw Error('CAD record exceeds export size limit.');return record}
$('cadInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const mesh=await parse(file),b64=await toB64(file);current=null;setCurrent(mesh,file.name,b64);$('cadName').value=file.name.replace(/\.[^.]+$/,'');$('cadUnits').disabled=['3mf','ork'].includes(mesh.type);notify(mesh.type==='ork'?`Imported OpenRocket reference: ${mesh.components.length} components. Original .ork preserved in the archive.`:`Imported ${file.name}: ${mesh.triangles.toLocaleString()} triangles. Save or export to archive it.`)}catch(e){notify(e.message,true)}e.target.value=''});
$('cadSave').addEventListener('click',async()=>{try{const r=snapshot();await transaction('readwrite',s=>s.put(r));current.savedAt=r.savedAt;notify('CAD reference saved in this browser. Export a backup for safekeeping.');await refresh()}catch(e){notify(e.message,true)}});
$('cadExport').addEventListener('click',()=>{try{const p=snapshot(),name=p.meta.name.replace(/[^a-z0-9-_]/gi,'_').slice(0,70)||'CAD';download(JSON.stringify(p,null,2),name+'.schwabcad.json','application/json');notify('Exported an archive containing notes and original CAD source bytes.')}catch(e){notify(e.message,true)}});
$('cadOpenRecord').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>15e6)throw Error('Archive exceeds 15 MB.');await readSavedRecord(JSON.parse(await file.text()))}catch(err){notify(err.message,true)}e.target.value=''});
$('cadOriginal').addEventListener('click',()=>{if(!current)return;download(fromB64(current.source.base64),current.source.name)});
$('cadClear').addEventListener('click',()=>{current=null;setMeta({});$('cadUnits').disabled=false;renderAll();notify('Workspace cleared. Saved library records are unchanged.')});
$('cadSearch').addEventListener('input',refresh);$('cadWire').addEventListener('change',draw);
$('cadResetView').addEventListener('click',()=>{yaw=.55;pitch=.35;zoom=1;draw()});
canvas.addEventListener('pointerdown',e=>{dragging=true;px=e.clientX;py=e.clientY;canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointermove',e=>{if(!dragging)return;yaw+=(e.clientX-px)*.012;pitch=Math.max(-1.4,Math.min(1.4,pitch+(e.clientY-py)*.012));px=e.clientX;py=e.clientY;draw()});canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.35,Math.min(5,zoom*Math.exp(-e.deltaY*.001)));draw()},{passive:false});
for(const x of ['bedX','bedY','bedZ'])$(x).addEventListener('input',fitCheck);
$('cadUnits').addEventListener('change',async()=>{if(!current||['3mf','ork'].includes(current.parsed.type))return;try{const source=current.source;const bytes=fromB64(source.base64);current.parsed=await parse(new File([bytes],source.name));renderAll();}catch(e){notify(e.message,true)}});
window.addEventListener('resize',draw);
window.SchwabCadTest={parseObj,asciiStl,parse3mf,readSavedRecord,snapshot,parse,fitCheck};
renderAll();refresh();
})();