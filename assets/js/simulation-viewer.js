'use strict';
/* Passive viewer of flight-data series already saved inside OpenRocket .ork files.
   Does not run a new simulation, infer absent data, or control hardware. */
(() => {
  const $ = id => document.getElementById(id);
  const MAX_POINTS = 12000;
  const MAX_BRANCHES = 12;
  const FIELD_DEFINITIONS = [
    ['TYPE_ALTITUDE', 'Altitude', 'm', ['altitude', 'altitude (h)', 'h']],
    ['TYPE_VELOCITY_TOTAL', 'Speed', 'm/s', ['velocity total', 'total velocity', 'velocity', 'speed']],
    ['TYPE_VELOCITY_Z', 'Vertical velocity', 'm/s', ['vertical velocity', 'velocity z']],
    ['TYPE_ACCELERATION_TOTAL', 'Acceleration', 'm/s²', ['total acceleration', 'acceleration']],
    ['TYPE_ACCELERATION_Z', 'Vertical acceleration', 'm/s²', ['vertical acceleration', 'acceleration z']],
    ['TYPE_THRUST_FORCE', 'Thrust (recorded)', 'N', ['thrust force', 'thrust']],
    ['TYPE_DRAG_FORCE', 'Drag (recorded)', 'N', ['drag force', 'drag']],
    ['TYPE_MASS', 'Mass (recorded)', 'kg', ['rocket mass', 'mass']],
    ['TYPE_POSITION_X', 'East displacement', 'm', ['position east of launch', 'position x']],
    ['TYPE_POSITION_Y', 'North displacement', 'm', ['position north of launch', 'position y']],
    ['TYPE_DRAG_COEFF', 'Drag coefficient', '', ['drag coefficient', 'cd']],
    ['TYPE_MACH_NUMBER', 'Mach number', '', ['mach number', 'mach']],
  ];
  const LEGACY_ALIASES = {
    'TYPE_TIME':['time','time (t)','t'],
    'TYPE_ALTITUDE':['altitude','altitude (h)','h'],
    'TYPE_VELOCITY_TOTAL':['total velocity','velocity','velocity (v)','speed'],
    'TYPE_VELOCITY_Z':['vertical velocity','vertical velocity (vz)','velocity z'],
    'TYPE_ACCELERATION_TOTAL':['total acceleration','acceleration','acceleration (at)'],
    'TYPE_ACCELERATION_Z':['vertical acceleration','vertical acceleration (az)'],
    'TYPE_THRUST_FORCE':['thrust force','thrust force (ft)','thrust'],
    'TYPE_DRAG_FORCE':['drag force','drag force (fd)','drag'],
    'TYPE_MASS':['mass','mass (m)'],
    'TYPE_POSITION_X':['position east of launch','position x'],
    'TYPE_POSITION_Y':['position north of launch','position y'],
    'TYPE_DRAG_COEFF':['drag coefficient','drag coefficient (cd)'],
    'TYPE_MACH_NUMBER':['mach number','mach number (m)'],
  };
  const norm = str => String(str||'').toLowerCase().replace(/[_\s()\-]+/g,' ').trim();
  const same = (a,b) => norm(a) === norm(b);
  const knownField = name => {
    const n=norm(name);
    if (!n) return null;
    for (const [key, ...rest] of [['TYPE_TIME'], ...FIELD_DEFINITIONS]) {
      const label=FIELD_DEFINITIONS.find(d=>d[0]===key)?.[1]||'Time';
      const aliases=LEGACY_ALIASES[key]||[];
      if (same(name,key) || aliases.some(a=>same(a,name)) || same(label,name)) return key;
    }
    return null;
  };
  const labelFor = key => FIELD_DEFINITIONS.find(d=>d[0]===key)?.[1] || key.replace(/^TYPE_/,'').replaceAll('_',' ').toLowerCase();
  const unitFor = key => FIELD_DEFINITIONS.find(d=>d[0]===key)?.[2] || '';
  const finite = s => {if(s===null||s===undefined||String(s).trim()==='')return null;const n=Number(s);return Number.isFinite(n)?n:null};
  const own = (el,name) => Array.from(el?.children||[]).find(ch=>ch.localName===name);
  const text = (el,name) => own(el,name)?.textContent?.trim()||'';
  const children = (el,name) => Array.from(el?.children||[]).filter(ch=>ch.localName===name);
  const format = (n, digits=2) => Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:digits}):'—';

  // Parse exactly the columns in <databranch types="..."> and comma-separated <datapoint> rows.
  // Preserve all actual field values, including unknown user-defined/custom expressions.
  function extract(simElement, index) {
    const flight=own(simElement,'flightdata');
    const summary={};
    for(const attr of ['maxaltitude','maxvelocity','maxacceleration','maxmach','timetoapogee','flighttime','groundhitvelocity']) summary[attr]=finite(flight?.getAttribute(attr));
    const branches=[];
    for(const node of children(flight,'databranch').slice(0,MAX_BRANCHES)) {
      const originalTypes=(node.getAttribute('types')||'').split(',').map(s=>s.trim()).filter(Boolean);
      const types=originalTypes.map((s,i)=>({key:knownField(s)||'custom_'+i,source:s}));
      const timeCol=types.findIndex(t=>t.key==='TYPE_TIME');
      const points=[];
      const dataRows=children(node,'datapoint');
      // Sample long saved recordings evenly, including the last record.
      const stride=Math.max(1,Math.ceil(dataRows.length/MAX_POINTS));
      const sampled=dataRows.filter((_,i)=>i%stride===0||i===dataRows.length-1);
      for(const elem of sampled){
        const fields=elem.textContent.trim().split(',');
        if(fields.length!==originalTypes.length)continue;
        const row=fields.map(finite);
        if(timeCol>=0&&!Number.isFinite(row[timeCol]))continue;
        points.push(row);
      }
      const events=children(node,'event').map(e=>({time:finite(e.getAttribute('time')),type:e.getAttribute('type')||'event'})).filter(e=>e.time!==null).slice(0,200);
      branches.push({name:node.getAttribute('name')||`Branch ${branches.length+1}`,types,points,events,totalPoints:dataRows.length,downsampled:dataRows.length>sampled.length});
    }
    return {name:text(simElement,'name')||`Simulation ${index+1}`,status:simElement.getAttribute('status')||'unknown',summary,
      // Retain legacy values consumed by the Design Archive's existing inventory.
      maxAltitude: summary.maxaltitude===null?'':String(summary.maxaltitude),
      flightTime: summary.flighttime===null?'':String(summary.flighttime),branches};
  }

  let simulations=[],simIndex=0,branchIndex=0,pointIndex=0,selectedFields=[],activeBranch=null;
  const DEFAULTS=['TYPE_ALTITUDE','TYPE_VELOCITY_TOTAL','TYPE_ACCELERATION_TOTAL','TYPE_THRUST_FORCE'];
  function currentSimulation(){return simulations[simIndex]||null}
  function viewData(){return currentSimulation()?.branches?.[branchIndex]||null}
  function timeColumn(branch){return branch?.types?.findIndex(t=>t.key==='TYPE_TIME')??-1}
  function timeOf(branch,p){const t=timeColumn(branch);return t>=0 ? p?.[t]??null : null}
  function readout(id,n,unit){$(id).textContent=n===null||n===undefined?'—':`${format(n)}${unit?' '+unit:''}`}
  function putOptions(select,entries,value){select.replaceChildren();for(const [v,label] of entries){const opt=document.createElement('option');opt.value=v;opt.textContent=label;select.append(opt)}select.value=value??entries[0]?.[0]??''}
  function statusText(msg){$('replayNotice').textContent=msg}
  function setupSimulation(index=0,branch=0){
    simIndex=Math.min(Math.max(0,index),Math.max(0,simulations.length-1));
    putOptions($('simSelect'),simulations.map((s,i)=>[String(i),s.name]),String(simIndex));
    const sim=currentSimulation();branchIndex=Math.min(Math.max(0,branch),Math.max(0,(sim?.branches?.length||0)-1));
    putOptions($('branchSelect'),(sim?.branches||[]).map((b,i)=>[String(i),b.name]),String(branchIndex));
    $('simSelect').disabled=!simulations.length;$('branchSelect').disabled=!(sim?.branches?.length);
    setBranch();
  }
  function setBranch(){
    activeBranch=viewData();pointIndex=0;
    const b=activeBranch;const timeIdx=timeColumn(b);
    const hasSeries=!!(b?.points?.length>=2&&timeIdx>=0);
    $('replayContent').hidden=!hasSeries;
    $('replayEmpty').hidden=hasSeries;
    $('exportSimCsv').disabled=!hasSeries;
    if(!hasSeries){
      const s=currentSimulation();
      $('replayEmpty').textContent=s? s.branches?.length? 'This saved branch has no readable time-series rows. Try another branch or re-save the simulation in OpenRocket with flight data included.':'This simulation contains summary information only, or no embedded flight-data branches. Re-run and save it with flight data in OpenRocket, then import that saved .ork file.':'Import an OpenRocket .ork file to explore its recorded simulations.';
      statusText(s?'Saved summaries remain available in the inspector. No missing time-series values are invented.':'No design imported.');
      return;
    }
    const fields=b.types.map((t,i)=>({i,key:t.key,label:knownField(t.source)?labelFor(t.key):t.source,unit:unitFor(t.key)})).filter(f=>f.key!=='TYPE_TIME'&&b.points.some(row=>Number.isFinite(row[f.i])));
    const selectBoxes=Array.from(document.querySelectorAll('.chart-selector'));
    selectedFields=selectBoxes.map((sel,i)=>{
      const prev=selectedFields[i];
      const preferred=[prev,DEFAULTS[i],...DEFAULTS,...fields.map(f=>f.key)].find(k=>fields.some(f=>f.key===k));
      const field=fields.find(f=>f.key===preferred)||fields[0];
      putOptions(sel,fields.map(f=>[String(f.i),`${f.label}${f.unit?' · '+f.unit:''}`]),field?String(field.i):'');
      sel.disabled=!fields.length;
      return field?.key||null;
    });
    $('replaySlider').max=String(Math.max(0,b.points.length-1));$('replaySlider').value='0';
    const detail=b.downsampled?`Display sampled from ${b.totalPoints.toLocaleString()} saved rows. `:'';
    statusText(`${currentSimulation().name} · ${b.name} · ${b.points.length.toLocaleString()} recorded samples. ${detail}Read-only archive data; no new trajectory calculated.`);
    render();
  }
  function chart(canvas,branch,col,idx){
    const box=canvas.getBoundingClientRect();const w=Math.max(200,box.width||350),h=Math.max(150,box.height||190);const dpi=Math.min(2,devicePixelRatio||1);
    canvas.width=Math.round(w*dpi);canvas.height=Math.round(h*dpi);
    const ctx=canvas.getContext('2d');ctx.scale(dpi,dpi);ctx.clearRect(0,0,w,h);
    const m={l:52,r:12,t:17,b:31},pw=w-m.l-m.r,ph=h-m.t-m.b;
    ctx.fillStyle='#9cb3c6';ctx.font='11px system-ui';
    if(!(col>=0)||!branch?.points.length){ctx.fillText('No recorded data for this parameter',16,30);return}
    const timeCol=timeColumn(branch);const filtered=branch.points.map((r,i)=>({t:r[timeCol],v:r[col],i})).filter(p=>Number.isFinite(p.t)&&Number.isFinite(p.v));
    if(filtered.length<2){ctx.fillText('Insufficient recorded measurements',16,30);return}
    const times=branch.points.map(r=>r[timeCol]).filter(Number.isFinite),minT=Math.min(...times),maxT=Math.max(...times),deltaT=Math.max(1e-6,maxT-minT);
    const vals=filtered.map(p=>p.v),mi=Math.min(...vals),ma=Math.max(...vals);const range=Math.max(Math.abs(ma-mi)*1.14,0.01,Math.abs(ma)*0.04),mid=(ma+mi)/2,lo=mid-range/2,hi=mid+range/2;
    const xx=t=>m.l+(t-minT)/deltaT*pw,yy=v=>m.t+(hi-v)/(hi-lo)*ph;
    ctx.lineWidth=1;ctx.strokeStyle='#2a4356';for(let j=0;j<=4;j++){let y=m.t+ph*j/4;ctx.beginPath();ctx.moveTo(m.l,y);ctx.lineTo(w-m.r,y);ctx.stroke();ctx.fillStyle='#9cb3c6';ctx.fillText(format(hi-(hi-lo)*j/4,1),4,y+4)}
    ctx.strokeStyle='#6b8fa7';ctx.beginPath();ctx.moveTo(m.l,m.t);ctx.lineTo(m.l,m.t+ph);ctx.lineTo(w-m.r,m.t+ph);ctx.stroke();
    ctx.fillStyle='#9cb3c6';ctx.fillText(format(minT,1)+'s',m.l,h-9);ctx.textAlign='right';ctx.fillText(format(maxT,1)+'s',w-m.r,h-9);ctx.textAlign='left';
    ctx.strokeStyle=['#65e7d0','#8ec6ff','#ffbe82','#d7a7f9'][idx%4];ctx.lineWidth=2;ctx.lineJoin='round';ctx.beginPath();let moved=false;
    for(const p of filtered){const x=xx(p.t),y=yy(p.v);if(!moved)ctx.moveTo(x,y);else ctx.lineTo(x,y);moved=true}ctx.stroke();
    const current=branch.points[pointIndex],curT=current?.[timeCol],curV=current?.[col];
    if(Number.isFinite(curT)){ctx.setLineDash([4,3]);ctx.strokeStyle='#e8f2fa8c';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(xx(curT),m.t);ctx.lineTo(xx(curT),m.t+ph);ctx.stroke();ctx.setLineDash([])}
    if(Number.isFinite(curT)&&Number.isFinite(curV)){ctx.beginPath();ctx.fillStyle='#e8ffff';ctx.arc(xx(curT),yy(curV),4.2,0,2*Math.PI);ctx.fill()}
  }
  function render(){
    const b=viewData();if(!b||!b.points.length||timeColumn(b)<0)return;
    const row=b.points[pointIndex]||b.points[0];const t=timeOf(b,row);
    $('replaySlider').value=String(pointIndex);$('replayClock').textContent=Number.isFinite(t)?format(t,2)+' s':'—';
    for(let i=0;i<4;i++){
      const sel=$('metricSelect'+i),col=Number(sel.value);const field=b.types[col];const reading=$('chartValue'+i);
      const val=field?row[col]:null;reading.textContent=Number.isFinite(val)?format(val,3)+' '+unitFor(field.key):'—';
      chart($('simChart'+i),b,field?col:-1,i);
    }
    const events=$('replayEvents');events.replaceChildren();const near=b.events.filter(e=>Number.isFinite(t)&&Math.abs(e.time-t)<1.25).slice(0,5);
    const label=document.createElement('span');label.className='eventlabel';label.textContent='Recorded events';events.append(label);
    if(!near.length){const el=document.createElement('span');el.textContent='No events within ±1.25 s of cursor';events.append(el)}
    for(const e of near){const el=document.createElement('span');el.className='eventpill';el.textContent=`${e.type.replaceAll('_',' ')} · ${format(e.time,2)} s`;events.append(el)}
  }
  function exportCsv(){
    const b=viewData();if(!b?.points.length)return;
    const esc=s=>'"'+String(s).replaceAll('"','""')+'"';
    const lines=[b.types.map(t=>esc(t.source)).join(','),...b.points.map(row=>row.map(x=>x===null?'':String(x)).join(','))];
    const blob=new Blob([lines.join('\r\n')+'\r\n'],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='SchwabLab_OpenRocket_saved_flight.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
  }
  function init(){
    $('simSelect').addEventListener('change',e=>setupSimulation(Number(e.target.value),0));
    $('branchSelect').addEventListener('change',e=>{branchIndex=Number(e.target.value);setBranch()});
    $('replaySlider').addEventListener('input',e=>{pointIndex=Number(e.target.value);render()});
    for(let i=0;i<4;i++){$('metricSelect'+i).addEventListener('change',e=>{selectedFields[i]=viewData()?.types[Number(e.target.value)]?.key||null;render()});$('simChart'+i).addEventListener('click',e=>{const b=viewData();const timeCol=timeColumn(b);if(!b?.points.length||timeCol<0)return;const rect=e.currentTarget.getBoundingClientRect(),fraction=Math.max(0,Math.min(1,(e.clientX-rect.left-52)/(rect.width-64)));const first=timeOf(b,b.points[0]),last=timeOf(b,b.points[b.points.length-1]);const target=first+fraction*(last-first);let lo=0,hi=b.points.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(timeOf(b,b.points[mid])<target)lo=mid+1;else hi=mid}pointIndex=lo;render()})}
    $('exportSimCsv').addEventListener('click',exportCsv);
    let resizeTimer=null;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,120)});
    setupSimulation();
  }
  function setDesign(design,state=null){simulations=Array.isArray(design?.simulations)?design.simulations:[];selectedFields=(Array.isArray(state?.fields)?state.fields:[]).slice(0,4);setupSimulation(Number(state?.simIndex)||0,Number(state?.branchIndex)||0);if(Number.isFinite(Number(state?.pointIndex))&&viewData()?.points?.length){pointIndex=Math.min(Math.max(0,Number(state.pointIndex)),viewData().points.length-1);render()}}
  function getState(){return {simIndex,branchIndex,pointIndex,fields:document.querySelectorAll('.chart-selector').length?Array.from(document.querySelectorAll('.chart-selector')).map(sel=>viewData()?.types[Number(sel.value)]?.key||null):selectedFields}}
  window.SchwabSimViewer={extract,init,setDesign,getState};
  document.addEventListener('DOMContentLoaded',init);
})();