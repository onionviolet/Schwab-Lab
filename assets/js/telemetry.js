'use strict';
(() => {
const $=id=>document.getElementById(id);
let measured=null,reference=null,revision=1;
const keys=['signal','shift','uncertainty','showBand','projectName','notes'];
const finite=x=>Number.isFinite(x);
const num=(v,d=2)=>finite(v)?v.toFixed(d):'—';
function note(t){$('status').textContent=t;}
function parseCSV(src){
  if(src.length>5e6)throw Error('CSV exceeds 5 MB.');
  const lines=src.replace(/^\ufeff/,'').split(/\r?\n/).filter(s=>s.trim()&&!s.trim().startsWith('#'));
  if(lines.length<3)throw Error('CSV requires headers and at least two rows.');
  const delimiter=[',','\t',';'].sort((a,b)=>lines[0].split(b).length-lines[0].split(a).length)[0];
  // Quoted delimiter and escaped quote support.
  function fields(line){let out=[],val='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){val+='"';i++}else quoted=!quoted}else if(c===delimiter&&!quoted){out.push(val.trim());val=''}else val+=c}out.push(val.trim());return out}
  let names=fields(lines[0]).map((s,i)=>s||'column_'+i);
  const timeIdx=names.findIndex(s=>/^(time|t|timestamp|time \(s\)|time_s|time \(seconds\))$/i.test(s.trim()));
  if(timeIdx<0)throw Error('Expected time column: time, t, timestamp, time (s), or time_s.');
  if(names.length>70)throw Error('Too many channels (maximum 70).');
  const records=[];let missing=0,nonmonotonic=0,duplicates=0,previous=-Infinity;
  for(const line of lines.slice(1,20002)){let parts=fields(line);let t=Number(parts[timeIdx]);if(!finite(t)||!parts[timeIdx]?.trim()){missing++;continue}if(t<previous)nonmonotonic++;if(t===previous)duplicates++;previous=t;
    const v={};for(let j=0;j<names.length;j++)if(j!==timeIdx){const raw=parts[j]?.trim();v[names[j]]=raw&&finite(Number(raw))?Number(raw):null}
    records.push({t,v});
  }
  if(records.length<2)throw Error('Not enough rows with valid timestamps.');
  records.sort((a,b)=>a.t-b.t);
  const unique=[];for(const r of records){if(unique.length&&unique.at(-1).t===r.t){unique[unique.length-1]=r}else unique.push(r)}
  const channels=names.filter((s,i)=>i!==timeIdx);
  return {records:unique,channels,meta:{rows:records.length,missing,nonmonotonic,duplicates,original:src}};
}
function sample(){
 let m=['time,altitude,acceleration,temperature'],r=['time,altitude,acceleration,temperature'];
 for(let i=0;i<=120;i++){const t=i*.25,z=45+35*Math.sin(Math.PI*t/30)+.7*Math.sin(t*3),ref=45+34*Math.sin(Math.PI*t/30);
 m.push([t.toFixed(2),z.toFixed(3),(Math.sin(t)*2).toFixed(3),(20+.5*Math.sin(t/4)).toFixed(3)].join(','));
 r.push([t.toFixed(2),ref.toFixed(3),(Math.sin(t+.2)*2).toFixed(3),'20'].join(','))}
 measured=parseCSV(m.join('\n'));reference=parseCSV(r.join('\n'));revision=1;refresh();note('Illustrative example loaded. Values are synthetic, not flight predictions.');
}
function channels(){let before=$('signal').value;const a=measured?.channels||[];$('signal').replaceChildren();for(const s of a){const opt=document.createElement('option');opt.value=s;opt.textContent=s;$('signal').append(opt)}if(a.includes(before))$('signal').value=before;else if(a.length)$('signal').value=a.find(x=>/altitude|height/i.test(x))||a[0]}
function interpolation(data,key,t){if(!data||!data.channels.includes(key))return null;const a=data.records;if(t<a[0].t||t>a.at(-1).t)return null;let lo=0,hi=a.length-1;while(lo<hi){const md=(lo+hi)>>1;if(a[md].t<t)lo=md+1;else hi=md}const b=a[lo],p=a[Math.max(0,lo-1)];if(!finite(b.v[key])||!finite(p.v[key]))return null;if(p===b)return b.v[key];return p.v[key]+(b.v[key]-p.v[key])*(t-p.t)/(b.t-p.t)}
function samples(){if(!measured)return [];const signal=$('signal').value,shift=Number($('shift').value)||0;return measured.records.map(r=>({t:r.t,y:r.v[signal],ref:interpolation(reference,signal,r.t-shift)}))}
function stats(data){let matched=data.filter(p=>finite(p.y)&&finite(p.ref));if(!matched.length)return {n:0};let residual=matched.map(p=>p.y-p.ref);return {n:matched.length,rmsd:Math.sqrt(residual.reduce((s,v)=>s+v*v,0)/residual.length),bias:residual.reduce((s,v)=>s+v,0)/residual.length}}
function quality(){
 if(!measured){$('quality').textContent='Import measurements to inspect data quality.';return}
 let a=measured.records,dt=[];for(let i=1;i<a.length;i++)dt.push(a[i].t-a[i-1].t);dt.sort((x,y)=>x-y);
 let median=dt[Math.floor(dt.length/2)],signal=$('signal').value,empty=a.filter(x=>!finite(x.v[signal])).length;
 $('quality').textContent='Valid samples: '+a.length+' · Duration: '+num(a.at(-1).t-a[0].t)+' s · Median interval: '+num(median,4)+' s · Approx. sampling rate: '+(median>0?num(1/median,2):'—')+' Hz · Missing selected signal: '+empty+' · Invalid timestamp rows: '+measured.meta.missing+' · Duplicate timestamps: '+measured.meta.duplicates+' · Out-of-order timestamps: '+measured.meta.nonmonotonic+'.';
}
function chart(){
 const canvas=$('chart'),width=canvas.clientWidth||700,height=canvas.clientHeight||350,dpr=Math.min(window.devicePixelRatio||1,2);
 canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,width,height);
 const data=samples();if(!data.length){ctx.fillStyle='#a6c0d2';ctx.fillText('Import a CSV or select the example dataset.',30,60);return}
 const shown=data.filter(p=>finite(p.y)||finite(p.ref));if(shown.length===0)return;
 const unc=Math.max(0,Number($('uncertainty').value)||0),band=$('showBand').checked?unc:0;
 let xmin=data[0].t,xmax=data.at(-1).t;let yy=shown.flatMap(p=>[p.y,p.ref].filter(finite));let ymin=Math.min(...yy)-band,ymax=Math.max(...yy)+band;
 if(ymax===ymin){ymax++;ymin--}let pad=(ymax-ymin)*.08;ymin-=pad;ymax+=pad;let L=55,R=18,T=20,B=36,W=Math.max(1,width-L-R),H=Math.max(1,height-T-B);
 let px=x=>L+(x-xmin)/Math.max(.001,xmax-xmin)*W,py=y=>T+(ymax-y)/(ymax-ymin)*H;
 ctx.font='11px system-ui';ctx.fillStyle='#a4bbcd';ctx.strokeStyle='#294256';ctx.lineWidth=1;
 for(let i=0;i<5;i++){let v=ymin+(ymax-ymin)*i/4,y=py(v);ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(width-R,y);ctx.stroke();ctx.fillText(num(v,1),5,y+4)}
 for(let i=0;i<=4;i++)ctx.fillText(num(xmin+(xmax-xmin)*i/4,1)+' s',px(xmin+(xmax-xmin)*i/4)-12,height-9);
 if(band){ctx.beginPath();let pts=data.filter(p=>finite(p.y));pts.forEach((p,i)=>i?ctx.lineTo(px(p.t),py(p.y+band)):ctx.moveTo(px(p.t),py(p.y+band)));pts.slice().reverse().forEach(p=>ctx.lineTo(px(p.t),py(p.y-band)));ctx.closePath();ctx.fillStyle='rgba(92,226,204,.14)';ctx.fill()}
 function line(key,color){ctx.beginPath();let on=false;for(const p of data){if(!finite(p[key])){on=false;continue}if(!on)ctx.moveTo(px(p.t),py(p[key]));else ctx.lineTo(px(p.t),py(p[key]));on=true}ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke()}
 line('ref','#ffbd77');line('y','#60e4ce');
 let selected=xmin+(xmax-xmin)*Number($('cursor').value)/1000;ctx.beginPath();ctx.moveTo(px(selected),T);ctx.lineTo(px(selected),height-B);ctx.strokeStyle='#dcefffaa';ctx.setLineDash([4,4]);ctx.stroke();ctx.setLineDash([]);
 $('cursorTime').textContent=num(selected,2)+' s';
}
function refresh(){channels();render()}
function render(){if(!measured){chart();return}const a=measured.records,ss=stats(samples());$('sourceInfo').textContent='Measured: '+a.length+' samples · Reference: '+(reference?reference.records.length+' samples':'none');$('count').textContent=a.length;$('duration').textContent=num(a.at(-1).t-a[0].t)+' s';$('rmsd').textContent=ss.n?num(ss.rmsd,3):'—';$('bias').textContent=ss.n?num(ss.bias,3):'—';quality();chart()}
async function readFile(file){if(!file)throw Error('Select a file.');if(file.size>5e6)throw Error('Maximum file size is 5 MB.');return file.text()}
async function handleCSV(input,which){try{const src=await readFile(input.files[0]);const parsed=parseCSV(src);if(which==='measured')measured=parsed;else reference=parsed;revision++;refresh();note(which+' CSV loaded.')}catch(e){note('Import error: '+e.message)}input.value=''}
$('measuredFile').addEventListener('change',e=>handleCSV(e.target,'measured'));$('referenceFile').addEventListener('change',e=>handleCSV(e.target,'reference'));
$('sampleBtn').addEventListener('click',sample);
for(const k of ['signal','shift','uncertainty','showBand','cursor'])$(k).addEventListener('input',render);
window.addEventListener('resize',chart);
function settings(){const x={};for(const k of keys)x[k]=$(k).type==='checkbox'?$(k).checked:$(k).value;return x}
function project(){return {schema:'schwab-lab-telemetry-v1',revision,exportedAt:new Date().toISOString(),settings:settings(),measuredCSV:measured?.meta.original??null,referenceCSV:reference?.meta.original??null}}
function load(p){if(!p||p.schema!=='schwab-lab-telemetry-v1')throw Error('Unsupported project schema.');const m=p.measuredCSV?parseCSV(p.measuredCSV):null,r=p.referenceCSV?parseCSV(p.referenceCSV):null;measured=m;reference=r;revision=Number.isInteger(p.revision)?p.revision:1;channels();for(const [k,v] of Object.entries(p.settings||{}))if(keys.includes(k)&&$(k))$(k).type==='checkbox'?$(k).checked=Boolean(v):$(k).value=String(v);render()}
function download(filename,s){let blob=new Blob([s],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('saveBtn').addEventListener('click',()=>{try{localStorage.setItem('schwabLabTelemetryV3',JSON.stringify(project()));note('Project saved in this browser. Export JSON for a durable backup.')}catch(e){note('Browser storage failed: '+e.message)}});
$('restoreBtn').addEventListener('click',()=>{try{const s=localStorage.getItem('schwabLabTelemetryV3');if(!s)throw Error('No locally saved project found.');load(JSON.parse(s));note('Saved project restored.')}catch(e){note('Restore failed: '+e.message)}});
$('exportBtn').addEventListener('click',()=>{download('schwab-telemetry-project.schwab.json',JSON.stringify(project(),null,2));note('Project JSON exported.')});
$('projectFile').addEventListener('change',async e=>{try{const s=await readFile(e.target.files[0]);load(JSON.parse(s));note('Project imported.')}catch(err){note('Project import error: '+err.message)}e.target.value=''});
chart();
window.__telemetryTest={parseCSV,interpolation,stats,samples,project,load};
})();