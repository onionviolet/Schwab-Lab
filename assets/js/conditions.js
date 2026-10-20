'use strict';
/* Schwab Lab site metadata and preliminary FAA Part 101 research flags.
   NO launch permission determination, no flight calculation, and no steering/control output. */
(() => {
  const $ = id => document.getElementById(id);
  const fields = [
    'siteName','siteDateTime','siteLat','siteLon','siteElevation','launchAngle',
    'sitePressure','siteTemp','siteHumidity','siteWind','siteVisibility','siteCloud',
    'construction','metalParts','slowProp','airspaceReview','sitePermission','safetyReview'
  ];
  const limits = {
    siteLat:[-90,90],siteLon:[-180,180],siteElevation:[-500,9000],launchAngle:[0,180],
    sitePressure:[300,1150],siteTemp:[-100,65],siteHumidity:[0,100],siteWind:[0,150],
    siteVisibility:[0,100],siteCloud:[0,100]
  };
  const defaults = {construction:'unknown',metalParts:'unknown',slowProp:'unknown',
    airspaceReview:'unverified',sitePermission:'unverified',safetyReview:'unverified'};
  const allowed = {
    construction:['unknown','accepted','other'],metalParts:['unknown','no','yes'],
    slowProp:['unknown','yes','no'],airspaceReview:['unverified','documented'],
    sitePermission:['unverified','documented'],safetyReview:['unverified','documented']
  };
  let map = null, marker = null, mapPending = null, manualEdit = false;
  const readNum = (id) => {const s=$(id).value.trim();return s===''?null:Number(s)};
  function capture(){
    const out={};
    for(const key of fields){
      const el=$(key);const val=el.value.trim();
      if(Object.hasOwn(limits,key)){
        if(val===''){out[key]=null;continue;}
        const n=Number(val),[lo,hi]=limits[key];
        if(!Number.isFinite(n)||n<lo||n>hi)throw Error(`${el.labels?.[0]?.textContent||key} must be between ${lo} and ${hi}.`);
        out[key]=n;
      }else if(allowed[key]){out[key]=allowed[key].includes(val)?val:defaults[key]}
      else{out[key]=val.slice(0,key==='siteName'?120:32)}
    }
    return out;
  }
  function restore(data){
    const obj=data&&typeof data==='object'?data:{};
    for(const key of fields){const el=$(key);if(!el)continue;const val=obj[key];
      if(Object.hasOwn(limits,key)){
        const n=val===null||val===undefined||val===''?null:Number(val);
        const [lo,hi]=limits[key];el.value=n!==null&&Number.isFinite(n)&&n>=lo&&n<=hi?String(n):'';
      }else if(allowed[key])el.value=allowed[key].includes(val)?val:defaults[key];
      else el.value=typeof val==='string'?val.slice(0,key==='siteName'?120:32):'';
    }
    updateMarker(false);review();
  }
  // Every result requires independent review. 'critical' means possibly outside
  // the *Class 1 definition*, never a claim that an operation is unlawful.
  function evaluate(report, rocket){
    const flags=[];
    const add=(level,title,detail,source)=>flags.push({level,title,detail,source});
    const mass=rocket.wetMass, prop=rocket.propMass;
    if(mass!=null && mass>1500) add('attention','Possible Class 1 classification mismatch',
      'Recorded loaded mass exceeds the 1,500 g Class 1 definition. This does not itself establish a legal violation; an appropriate FAA classification and independent review are needed.','§ 101.22(a)(5)');
    else if(mass==null) add('review','Loaded mass not documented',
      'The all-up mass, including propellant, is needed for the Class 1 definition check.','§ 101.22(a)(5)');
    if(prop!=null && prop>125) add('attention','Possible Class 1 classification mismatch',
      'Recorded propellant mass exceeds the 125 g Class 1 definition; a different regulatory classification may apply.','§ 101.22(a)(1)');
    else if(prop==null) add('review','Propellant mass not documented',
      'The propellant mass is missing, so Class 1 criteria cannot be fully evaluated.','§ 101.22(a)(1)');
    if(mass!=null&&prop!=null&&prop>mass) add('review','Inconsistent mass entries',
      'Recorded propellant mass is greater than recorded loaded mass; verify the source data.','Data check');
    if(report.construction==='other') add('attention','Construction may not match Class 1',
      'The Class 1 definition specifies paper, wood or breakable plastic. Review material classification independently.','§ 101.22(a)(3)');
    else if(report.construction!=='accepted') add('review','Construction material not verified',
      'Document whether the construction meets the Class 1 material definition.','§ 101.22(a)(3)');
    if(report.metalParts==='yes') add('attention','Metal content may exclude Class 1',
      'Class 1 does not permit substantial metal parts. Obtain an independent assessment.','§ 101.22(a)(4)');
    else if(report.metalParts!=='no') add('review','Substantial metal parts unverified',
      'The material criterion cannot be fully assessed from the current records.','§ 101.22(a)(4)');
    if(report.slowProp==='no') add('attention','Propellant type may exclude Class 1',
      'The Class 1 definition requires slow-burning propellant. Verify applicable motor documentation.','§ 101.22(a)(2)');
    else if(report.slowProp!=='yes') add('review','Propellant type unverified',
      'The slow-burning criterion has not been documented.','§ 101.22(a)(2)');
    if(!report.siteLat && report.siteLat!==0 || !Number.isFinite(Number(report.siteLon)) || report.siteLon==null) add('review','Site coordinates not recorded',
      'Coordinates are missing. Even with coordinates, this tool cannot identify restricted or controlled airspace.','Independent verification');
    if(!report.siteDateTime) add('review','Date and time not recorded',
      'The record is missing a date/time. Airspace conditions and authorizations are time-sensitive.','Independent verification');
    if(report.airspaceReview!=='documented') add('review','FAA airspace review outstanding',
      'Map tiles do not identify controlled airspace, airports, waivers, restrictions, or NOTAMs. Check with authoritative FAA resources and organizers.','§§ 101.23, 101.25');
    if(report.sitePermission!=='documented') add('review','Site permission unverified',
      'Record landowner and site permissions separately; this is not assessed by federal airspace checks.','Site review');
    if(report.safetyReview!=='documented') add('review','Hazard assessment not documented',
      'Federal rules require amateur rockets not to create a hazard to people, property, or aircraft.','§ 101.23');
    add('info','Additional FAA requirements may apply',
      'If the operation is not Class 1, special restrictions and ATC notifications may apply. Schwab Lab does not determine rocket class, review airspace, or issue approval.','§§ 101.25–101.29');
    return flags;
  }
  function review(){
    let state;
    try{state=capture()}catch(e){$('flagSummary').textContent='Please check input values';$('flagList').replaceChildren();const d=document.createElement('p');d.className='flag-item flag-attention';d.textContent=e.message;$('flagList').append(d);return;}
    const rocket={wetMass:readNum('wetMass'),propMass:readNum('propMass')};
    const flags=evaluate(state,rocket),count=flags.filter(x=>x.level==='attention').length;
    $('flagSummary').textContent=count?`${count} potential Class 1 issue${count===1?'':'s'} · review required`:`${flags.filter(x=>x.level==='review').length} items to verify · not a legal determination`;
    $('flagSummary').dataset.status=count?'attention':'review';
    const list=$('flagList');list.replaceChildren();
    for(const flag of flags){
      const box=document.createElement('article');box.className='flag-item flag-'+flag.level;
      const head=document.createElement('div');head.className='flag-head';
      const strong=document.createElement('strong');strong.textContent=flag.title;head.append(strong);
      const label=document.createElement('span');label.textContent=flag.level==='attention'?'POTENTIAL ISSUE':flag.level==='review'?'VERIFY':'CONTEXT';head.append(label);box.append(head);
      const p=document.createElement('p');p.textContent=flag.detail;box.append(p);
      const code=document.createElement('small');code.textContent=flag.source;box.append(code);list.append(box);
    }
  }
  function updateMarker(move){
    if(!map)return;
    const lat=readNum('siteLat'),lon=readNum('siteLon');
    if(lat===null||lon===null||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){if(marker){map.removeLayer(marker);marker=null}return;}
    if(!marker)marker=L.marker([lat,lon]).addTo(map);else marker.setLatLng([lat,lon]);
    if(move)map.setView([lat,lon],Math.max(map.getZoom(),9));
  }
  function initializeMap(){
    if(!window.L){$('mapFallback').textContent='Interactive map unavailable offline. Type latitude and longitude directly; no online data is required to save the project.';return;}
    try{
      map=L.map('siteMap',{scrollWheelZoom:false}).setView([39,-97],4);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
        maxZoom:18,attribution:'© OpenStreetMap contributors',crossOrigin:true
      }).addTo(map);
      map.on('click',ev=>{const {lat,lng}=ev.latlng;$('siteLat').value=lat.toFixed(6);$('siteLon').value=lng.toFixed(6);updateMarker(false);review()});
      updateMarker(true);
      setTimeout(()=>map?.invalidateSize(),100);
    }catch(err){$('mapFallback').textContent='Map is unavailable. Enter coordinates manually.'}
  }
  for(const id of fields){$(id).addEventListener('input',()=>{if(id==='siteLat'||id==='siteLon')updateMarker(false);review()});$(id).addEventListener('change',review)}
  initializeMap();review();
  window.SchwabConditions={capture,restore,review,evaluate};
})();