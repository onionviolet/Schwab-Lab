'use strict';
(() => {
const $ = id => document.getElementById(id);
const scene=$('scene'), aChart=$('altChart'), sChart=$('speedChart');
const ui={}; for(const id of ['v0','side','wind','drag','bearing','elev']) ui[id]=$(id);
let rows=[], apIdx=0, index=0, anim=false, lastFrame=0, elapsed=0, source='demo', yaw=0.58,pitch=0.33,zoom=1,dragging=false,px=0,py=0;
const clamp=(a,l,h)=>Math.max(l,Math.min(h,a));
const fmt=(n,d=1)=>Number.isFinite(n)?n.toFixed(d):'—';
const norm=v=>Math.hypot(...v), vecNorm=v=>{const mag=norm(v);return mag>1e-12?v.map(q=>q/mag):[0,0,0]};
function demo(){
  let t=0, x=0,y=0,z=25, vx=+ui.side.value,vy=1.5,vz=+ui.v0.value;
  let recovering=false, dt=.08;let wind=+ui.wind.value, k=+ui.drag.value;
  const out=[];
  for(let n=0;n<2500;n++){
    let damping=recovering?1.13:k;
    let ax=-damping*(vx-wind),ay=-damping*vy,az=-9.81-damping*vz;
    out.push({t,x,y,z,vx,vy,vz,ax,ay,az});
    if(vz<=0) recovering=true;
    vx+=ax*dt;vy+=ay*dt;vz+=az*dt;
    x+=vx*dt;y+=vy*dt;z+=vz*dt;t+=dt;
    if(z<=0&&n>2){out.push({t,x,y,z:0,vx,vy,vz,ax,ay,az});break;}
  }
  return out;
}
function updateLabels(){ui.v0.nextElementSibling; $('v0val').textContent=fmt(+ui.v0.value,0)+' m/s';$('sideval').textContent=fmt(+ui.side.value,1)+' m/s';$('windval').textContent=fmt(+ui.wind.value,1)+' m/s';$('dragval').textContent=fmt(+ui.drag.value,2)+' /s';$('bearingval').textContent=ui.bearing.value+'°';$('elevval').textContent=ui.elev.value+'°';}
function useData(data,kind){
 if(!data||data.length<3)throw Error('Need at least 3 valid measurements.');
 const max=20000; if(data.length>max) throw Error('More than 20,000 rows. Please reduce the log size.');
 for(let i=0;i<data.length;i++){const r=data[i];if(!Number.isFinite(r.t+r.x+r.y+r.z)||i>0&&r.t<=data[i-1].t)throw Error('Times must increase and positions must be numeric.');}
 // Fill missing velocity/acceleration columns using nonuniform-time numerical differentiation.
 const diff=(i,key)=>{let l=Math.max(i-1,0),h=Math.min(i+1,data.length-1);return (data[h][key]-data[l][key])/(data[h].t-data[l].t)};
 for(let i=0;i<data.length;i++)for(const [q,p] of [['vx','x'],['vy','y'],['vz','z']])if(!Number.isFinite(data[i][q]))data[i][q]=diff(i,p);
 for(let i=0;i<data.length;i++)for(const [q,p] of [['ax','vx'],['ay','vy'],['az','vz']])if(!Number.isFinite(data[i][q]))data[i][q]=diff(i,p);
 rows=data;source=kind;apIdx=0;for(let i=1;i<rows.length;i++)if(rows[i].z>rows[apIdx].z)apIdx=i;
 anim=false;$('playBtn').textContent='▶ Play';index=0;elapsed=rows[0].t;$('timeline').value=0;
 $('sourceBadge').textContent=kind==='demo'?'DEMO':'IMPORTED';$('rowsInfo').textContent=rows.length+' samples · '+(kind==='demo'?'illustrative motion':'imported log');$('error').textContent='';
 renderAll();
}
function tryDemo(){updateLabels(); try{useData(demo(),'demo')}catch(e){$('error').textContent=e.message}}
for(const id of ['v0','side','wind','drag'])ui[id].addEventListener('input',()=>{updateLabels();if(source==='demo')tryDemo()});
for(const id of ['bearing','elev'])ui[id].addEventListener('input',()=>{updateLabels();renderAll()});
for(const id of ['showVel','showAcc','showRef'])$(id).addEventListener('change',renderScene);
$('demoBtn').addEventListener('click',tryDemo);
function parseCsv(text){
 let clean=text.replace(/^\ufeff/,'').trim();
 // OpenRocket uses a commented column-header row followed by numeric data.
 clean=clean.split(/\r?\n/).map(line=>/^\s*#\s*time\s*\(/i.test(line)&&/,\s*altitude\s*\(/i.test(line)?line.replace(/^\s*#\s*/, ''):line).join('\n');
 let firstLine=clean.split(/\r?\n/).find(l=>l.trim()&&!l.trim().startsWith('#'))||'';
 let delimiter=[',','\t',';'].sort((a,b)=>firstLine.split(b).length-firstLine.split(a).length)[0];
 const matrix=[];let item='',line=[],inQuote=false;
 for(let i=0;i<clean.length;i++){
  let c=clean[i];if(c==='"'){if(inQuote&&clean[i+1]==='"'){item+='"';i++}else inQuote=!inQuote}
  else if(!inQuote&&c===delimiter){line.push(item.trim());item=''}
  else if(!inQuote&&(c==='\n'||c==='\r')){if(c==='\r'&&clean[i+1]==='\n')i++;line.push(item.trim());if(line.some(Boolean)&&!line[0].startsWith('#'))matrix.push(line);line=[];item=''}
  else item+=c;
 }
 line.push(item.trim());if(line.some(Boolean)&&!line[0].startsWith('#'))matrix.push(line);
 if(matrix.length<4)throw Error('CSV requires a header and at least 3 data rows.');
 const normalize=s=>s.toLowerCase().replace(/\[[^\]]*\]/g,'').replace(/\([^)]*\)/g,'').replace(/[^a-z0-9]/g,'');
 const fields=matrix[0].map(normalize);
 const choices={t:['time','t','times'],x:['x','xm','east','positioneast','eastposition','positioneastoflaunch'],y:['y','ym','north','positionnorth','northposition','positionnorthoflaunch'],z:['z','zm','altitude','height','altitudeagl','altitudeaboveground','altitudeabovegroundlevel','verticalposition'],vx:['vx','veast','velocityeast','eastvelocity','velocityx'],vy:['vy','vnorth','velocitynorth','northvelocity','velocityy'],vz:['vz','vup','verticalvelocity','velocityz','velocityup'],ax:['ax','accelerationx'],ay:['ay','accelerationy'],az:['az','verticalacceleration','accelerationz']};
 let cols={}; for(let [key,opts] of Object.entries(choices)){let i=fields.findIndex(s=>opts.includes(s));cols[key]=i}
 if(cols.t<0||cols.z<0)throw Error('Missing time or altitude column. Required: time,z (or time,altitude).');
 let result=[];for(let ri=1;ri<matrix.length;ri++){
  let cells=matrix[ri];if(!cells.join('').trim())continue;
  let num=k=>cols[k]<0?NaN:Number(cells[cols[k]]);
  let t=num('t'),z=num('z');if(!Number.isFinite(t)||!Number.isFinite(z))continue;
  let v={t,x:cols.x>=0?num('x'):0,y:cols.y>=0?num('y'):0,z};
  for(let q of ['vx','vy','vz','ax','ay','az'])v[q]=cols[q]<0?NaN:num(q);
  result.push(v);
 }
 return result;
}
$('csvInput').addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file)return;
 try{const data=parseCsv(await file.text());useData(data,'import')}catch(error){$('error').textContent=error.message}
 e.target.value='';
});
function csvText(array){return 'time,x,y,z,vx,vy,vz,ax,ay,az\n'+array.map(r=>['t','x','y','z','vx','vy','vz','ax','ay','az'].map(k=>fmt(r[k],5)).join(',')).join('\n')+'\n'}
function download(content,name,mime='text/csv') {let a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type:mime}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),500)}
$('exportBtn').addEventListener('click',()=>download(csvText(rows),'schwab_lab_flight_data.csv'));
// Local-only snapshot of the current trajectory for follow-up analysis.
$('saveFlightBtn').addEventListener('click',()=>{
 try{localStorage.setItem('schwabLabSavedFlight',JSON.stringify({version:1,when:new Date().toISOString(),rows:rows.slice(0,20000)}));$('error').textContent='Saved flight data in this browser. Export a CSV for a portable copy.'}catch(e){$('error').textContent='Browser storage unavailable or full; export CSV instead.'}
});
$('loadFlightBtn').addEventListener('click',()=>{
 try{const saved=JSON.parse(localStorage.getItem('schwabLabSavedFlight')||'null');if(!saved||!Array.isArray(saved.rows))throw Error('No saved flight found in this browser.');useData(saved.rows,'saved');$('error').textContent='Loaded your saved flight.'}catch(e){$('error').textContent=e.message||'Could not load the saved flight.'}
});

$('csvHelp').addEventListener('click',()=>download('time,x,y,z\n0,0,0,0\n1,1,0,10\n2,2,1,18\n3,3,2,21\n4,4,3,19\n5,5,3,12\n6,6,4,0\n','flight_csv_template.csv'));
const timeIndex=t=>{let l=0,h=rows.length-1;while(l<h){let m=(l+h)>>1;if(rows[m].t<t)l=m+1;else h=m}return clamp(l,0,rows.length-1)};
function setTime(t){elapsed=clamp(t,rows[0].t,rows.at(-1).t);index=timeIndex(elapsed);$('timeline').value=Math.round(1000*(elapsed-rows[0].t)/(rows.at(-1).t-rows[0].t));renderAll()}
$('timeline').addEventListener('input',e=>{anim=false;$('playBtn').textContent='▶ Play';setTime(rows[0].t+(rows.at(-1).t-rows[0].t)*e.target.value/1000)});
$('playBtn').addEventListener('click',()=>{anim=!anim;$('playBtn').textContent=anim?'❚❚ Pause':'▶ Play';if(anim&&index>=rows.length-1){elapsed=rows[0].t;index=0}lastFrame=0});
$('stepBtn').addEventListener('click',()=>{anim=false;$('playBtn').textContent='▶ Play';index=Math.min(index+1,rows.length-1);setTime(rows[index].t)});
$('resetCam').addEventListener('click',()=>{yaw=.58;pitch=.33;zoom=1;renderScene()});
scene.addEventListener('pointerdown',e=>{dragging=true;px=e.clientX;py=e.clientY;scene.setPointerCapture(e.pointerId)});
scene.addEventListener('pointermove',e=>{if(!dragging)return;yaw+=(e.clientX-px)*.008;pitch=clamp(pitch+(e.clientY-py)*.008,-1.2,1.2);px=e.clientX;py=e.clientY;renderScene()});
scene.addEventListener('pointerup',()=>dragging=false);scene.addEventListener('pointercancel',()=>dragging=false);
scene.addEventListener('wheel',e=>{e.preventDefault();zoom=clamp(zoom*Math.exp(-e.deltaY*.001),.45,3);renderScene()},{passive:false});
function fitCanvas(el){let width=el.clientWidth,height=el.clientHeight,dpr=Math.min(window.devicePixelRatio||1,2);let w=Math.max(1,Math.round(width*dpr)),h=Math.max(1,Math.round(height*dpr));if(el.width!==w||el.height!==h){el.width=w;el.height=h}let cx=el.getContext('2d');cx.setTransform(dpr,0,0,dpr,0,0);return {ctx:cx,w:width,h:height}}
function project(p,center,worldScale,w,h){
 let x=p.x-center.x,y=p.y-center.y,z=p.z-center.z;
 let X=Math.cos(yaw)*x-Math.sin(yaw)*y,Y=Math.sin(yaw)*x+Math.cos(yaw)*y;
 let vert=Math.cos(pitch)*z-Math.sin(pitch)*Y;
 let horiz=X;return {x:w/2+horiz*worldScale,y:h*.55-vert*worldScale};
}
function drawArrow(ctx,a,b,color,dashed=false,opacity=1){const angle=Math.atan2(b.y-a.y,b.x-a.x);ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2.4;ctx.globalAlpha=opacity;ctx.setLineDash(dashed?[5,5]:[]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);const size=8;ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-size*Math.cos(angle-.45),b.y-size*Math.sin(angle-.45));ctx.lineTo(b.x-size*Math.cos(angle+.45),b.y-size*Math.sin(angle+.45));ctx.closePath();ctx.fill();ctx.restore()}
function drawScene(){
 if(!rows.length)return;
 let {ctx,w,h}=fitCanvas(scene);ctx.clearRect(0,0,w,h);
 const r0=rows[0],maxZ=Math.max(...rows.map(r=>r.z)),minZ=Math.min(0,...rows.map(r=>r.z));
 let minX=Math.min(...rows.map(r=>r.x)),maxX=Math.max(...rows.map(r=>r.x)),minY=Math.min(...rows.map(r=>r.y)),maxY=Math.max(...rows.map(r=>r.y));
 let range=Math.max(maxZ-minZ,maxX-minX,maxY-minY,10),center={x:(minX+maxX)/2,y:(minY+maxY)/2,z:(minZ+maxZ)/2};
 let worldScale=Math.min(w*.68,h*.73)/range*zoom;
 const point=p=>project(p,center,worldScale,w,h);
 const origin={x:r0.x,y:r0.y,z:0};
 let gridExtent=range*.55,step=Math.pow(10,Math.floor(Math.log10(range/4)));if(range/(step)>11)step*=2;if(range/(step)>11)step*=2;
 ctx.lineWidth=.8;ctx.strokeStyle='#31506780';
 for(let i=-5;i<=5;i++){
  for(const [a,b] of [[{x:origin.x+i*step,y:origin.y-5*step,z:0},{x:origin.x+i*step,y:origin.y+5*step,z:0}],[{x:origin.x-5*step,y:origin.y+i*step,z:0},{x:origin.x+5*step,y:origin.y+i*step,z:0}]]){let A=point(a),B=point(b);ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke()}
 }
 // axes and ticks
 let axes=[{d:[1,0,0],lbl:'EAST (x)',c:'#8aa9bc'},{d:[0,1,0],lbl:'NORTH (y)',c:'#8aa9bc'},{d:[0,0,1],lbl:'UP (z)',c:'#83cfb9'}];
 ctx.font='11px ui-sans-serif,system-ui';
 for(let axis of axes){let P=point(origin),Q=point({x:origin.x+axis.d[0]*range*.7,y:origin.y+axis.d[1]*range*.7,z:axis.d[2]*range*.7});ctx.strokeStyle=axis.c;ctx.lineWidth=1.25;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(P.x,P.y);ctx.lineTo(Q.x,Q.y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=axis.c;ctx.fillText(axis.lbl,Q.x+4,Q.y-4)}
 // full path and traveled track
 const drawPath=(end,color,lineWidth)=>{ctx.beginPath();let jump=Math.max(1,Math.ceil(rows.length/2400));for(let i=0;i<=end;i+=jump){let q=point(rows[i]);if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y)}let final=point(rows[end]);ctx.lineTo(final.x,final.y);ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.stroke()};
 drawPath(rows.length-1,'#45778c',1.7);drawPath(index,'#4fe7ca',3.2);
 const peak=point(rows[apIdx]);ctx.fillStyle='#fcbd72';ctx.beginPath();ctx.arc(peak.x,peak.y,4.2,0,Math.PI*2);ctx.fill();ctx.font='11px system-ui';ctx.fillText('APOGEE',peak.x+8,peak.y-7);
 let r=rows[index],p=point(r);let dotrad=5.5;ctx.fillStyle='#ddfff8';ctx.beginPath();ctx.arc(p.x,p.y,dotrad,0,2*Math.PI);ctx.fill();ctx.strokeStyle='#61e4d1';ctx.lineWidth=1.8;ctx.beginPath();ctx.arc(p.x,p.y,dotrad+5,0,2*Math.PI);ctx.stroke();
 // directional arrows use constant display lengths; no physical proportionality intended.
 let L=Math.min(range*.24,Math.max(14,range*.16));
 const v=[r.vx,r.vy,r.vz],a=[r.ax,r.ay,r.az];
 for(let [toggle,data,col,shift] of [['showVel',v,'#79bfff',0],['showAcc',a,'#ffbd73',0]]){
  if(!$(toggle).checked||norm(data)<1e-9)continue;
  let d=vecNorm(data),q=point({x:r.x+d[0]*L,y:r.y+d[1]*L,z:r.z+d[2]*L});drawArrow(ctx,p,q,col);
 }
 if($('showRef').checked){let b=+ui.bearing.value*Math.PI/180,e=+ui.elev.value*Math.PI/180,d=[Math.cos(e)*Math.sin(b),Math.cos(e)*Math.cos(b),Math.sin(e)],q=point({x:r.x+d[0]*L,y:r.y+d[1]*L,z:r.z+d[2]*L});drawArrow(ctx,p,q,'#c6a3ff',true,.95)}
}
function drawPlot(canvas,key,color){
 if(!rows.length)return;const {ctx,w,h}=fitCanvas(canvas);ctx.clearRect(0,0,w,h);
 const g={l:48,r:18,t:37,b:28},plotW=Math.max(1,w-g.l-g.r),plotH=Math.max(1,h-g.t-g.b);
 let values=rows.map(r=>key==='z'?r.z:Math.hypot(r.vx,r.vy,r.vz));let rawMin=Math.min(...values),rawMax=Math.max(...values),ymin=Math.min(0,rawMin),ymax=Math.max(1,rawMax*1.11);if(ymax-ymin<.01)ymax=ymin+1;
 const time0=rows[0].t,span=Math.max(.00001,rows.at(-1).t-time0);
 const tx=t=>g.l+(t-time0)/span*plotW;
 const ty=v=>g.t+(ymax-v)/(ymax-ymin)*plotH;
 ctx.lineWidth=1;ctx.font='10px system-ui';ctx.textAlign='right';
 for(let i=0;i<=4;i++){let value=ymin+(ymax-ymin)*i/4,yy=ty(value);ctx.strokeStyle='#294357';ctx.beginPath();ctx.moveTo(g.l,yy);ctx.lineTo(w-g.r,yy);ctx.stroke();ctx.fillStyle='#7e9db4';ctx.fillText(fmt(value,value>=100?0:1),g.l-8,yy+4)}
 ctx.fillStyle='#819cb1';ctx.textAlign='center';for(let i=0;i<=4;i++){let t=time0+span*i/4;ctx.fillText(fmt(t,1)+' s',tx(t),h-10)}
 ctx.beginPath();let stride=Math.max(1,Math.floor(rows.length/2400));for(let i=0;i<rows.length;i+=stride){let x=tx(rows[i].t),y=ty(values[i]);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.lineTo(tx(rows.at(-1).t),ty(values.at(-1)));ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();
 let t=rows[index].t;ctx.setLineDash([4,5]);ctx.strokeStyle='#f1f6ffbb';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(tx(t),g.t);ctx.lineTo(tx(t),h-g.b);ctx.stroke();ctx.setLineDash([]);
 ctx.fillStyle=color;ctx.beginPath();ctx.arc(tx(t),ty(values[index]),4.5,0,2*Math.PI);ctx.fill();
}
function renderTelemetry(){let r=rows[index],ap=rows[apIdx];$('clock').textContent=fmt(r.t,1)+' s';$('altValue').innerHTML=fmt(r.z)+' <small>m</small>';$('spdValue').innerHTML=fmt(norm([r.vx,r.vy,r.vz]))+' <small>m/s</small>';$('apValue').innerHTML=fmt(ap.z)+' <small>m</small>';$('apTime').textContent='Apogee time: '+fmt(ap.t)+' s';$('phase').textContent=index<apIdx?'ASCENT':index===apIdx?'APOGEE':'DESCENT';
 for(let k of ['vx','vy','vz'])$(k).textContent=fmt(r[k],2)+' m/s';$('accel').textContent=fmt(norm([r.ax,r.ay,r.az]),2)+' m/s²';
 let b=+ui.bearing.value*Math.PI/180,e=+ui.elev.value*Math.PI/180,d=[Math.cos(e)*Math.sin(b),Math.cos(e)*Math.cos(b),Math.sin(e)],v=[r.vx,r.vy,r.vz],vm=norm(v),c=vm<1e-7?NaN:clamp(v.reduce((s,n,i)=>s+n*d[i],0)/vm,-1,1);
 $('errorAngle').textContent=Number.isFinite(c)?fmt(Math.acos(c)*180/Math.PI)+'°':'—';$('drift').textContent=fmt(Math.hypot(r.x-rows[0].x,r.y-rows[0].y))+' m';$('duration').textContent=fmt(rows.at(-1).t-rows[0].t)+' s';
}
function renderScene(){drawScene()}
function renderAll(){if(!rows.length)return;renderTelemetry();drawScene();drawPlot(aChart,'z','#4de1c6');drawPlot(sChart,'s','#7dbfff')}
window.addEventListener('resize',renderAll);
function frame(ts){if(anim&&rows.length){if(!lastFrame)lastFrame=ts;let dt=Math.min((ts-lastFrame)/1000,.15);elapsed+=dt*Number($('speed').value);if(elapsed>=rows.at(-1).t){elapsed=rows.at(-1).t;anim=false;$('playBtn').textContent='▶ Play'}index=timeIndex(elapsed);$('timeline').value=Math.round(1000*(elapsed-rows[0].t)/(rows.at(-1).t-rows[0].t));renderAll()}lastFrame=ts;requestAnimationFrame(frame)}
tryDemo();
// Receive a passive simulated trajectory from Physics Studio via same-tab session storage.
try{const transferred=sessionStorage.getItem('schwabLabPhysicsFlight');if(transferred){sessionStorage.removeItem('schwabLabPhysicsFlight');useData(JSON.parse(transferred),'physics')}}catch(e){$('error').textContent='Unable to open the transferred simulation.'}
requestAnimationFrame(frame);
window.__schwabLabTest={get rows(){return rows},get index(){return index},parseCsv,renderAll};
})();