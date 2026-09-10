import * as THREE from 'three';
import { OrbitControls } from './assets/OrbitControls.js';
import { geography } from './geography.js';

const $ = id => document.getElementById(id);
const status = $('status');
try {
  const renderer = new THREE.WebGLRenderer({antialias:true, alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor('#b1c6bb');
  $('map').appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','中国三维地形，使用侧栏按钮选择视角和区域');
  renderer.domElement.addEventListener('webglcontextlost',event=>{
    event.preventDefault(); status.style.display='flex';status.innerHTML='<strong>三维显示已暂停</strong><p>请刷新页面重新加载地形。</p>';
  });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.1,600);
  const controls = new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;
  controls.dampingFactor=.08;
  controls.zoomSpeed=3;
  controls.zoomToCursor=true;
  controls.minDistance=6;controls.maxDistance=200;
  controls.maxPolarAngle=Math.PI*.43;
  scene.add(new THREE.AmbientLight(0xffffff,2.2));
  const sun = new THREE.DirectionalLight(0xfff6df,1.3);
  sun.position.set(-40,65,-35);scene.add(sun);
  const [meta, buffer, texture] = await Promise.all([
    fetch('./assets/metadata.json').then(r=>{if(!r.ok)throw Error('高程信息加载失败');return r.json();}),
    fetch('./assets/height.bin').then(r=>{if(!r.ok)throw Error('高程数据加载失败');return r.arrayBuffer();}),
    new THREE.TextureLoader().loadAsync('./assets/relief.jpg')
  ]);
  const heights=new DataView(buffer);
  if(buffer.byteLength!==meta.width*meta.height*2)throw Error('高程数据不完整');
  const width=68, depth=width*(meta.mercatorY1-meta.mercatorY0)/((meta.east-meta.west)/360);
  const geometry=new THREE.PlaneGeometry(width,depth,meta.width-1,meta.height-1);
  geometry.rotateX(-Math.PI/2);
  const positions=geometry.attributes.position;
  // Web Mercator ground scale at 35°N; exaggeration is relative to this scale.
  const metersPerUnit=111320*Math.cos(35*Math.PI/180);
  let exaggeration=50;
  function setHeight(){
    for(let i=0;i<positions.count;i++)positions.setY(i,Math.max(0,heights.getUint16(i*2,true)-32768)/metersPerUnit*exaggeration);
    positions.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();
  }
  setHeight();
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
  const material=new THREE.MeshStandardMaterial({map:texture,roughness:1,metalness:0});
  scene.add(new THREE.Mesh(geometry,material));
  const base=new THREE.Mesh(new THREE.BoxGeometry(width,.35,depth),new THREE.MeshStandardMaterial({color:'#849c83',roughness:1}));
  base.position.y=-.22;scene.add(base);
  function point(lon,lat){
    const u=(lon-meta.west)/(meta.east-meta.west);
    const my=(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2;
    const v=(my-meta.mercatorY0)/(meta.mercatorY1-meta.mercatorY0);
    const index=Math.round(v*(meta.height-1))*meta.width+Math.round(u*(meta.width-1));
    return new THREE.Vector3((u-.5)*width,Math.max(0,heights.getUint16(index*2,true)-32768)/metersPerUnit*exaggeration+.3,(v-.5)*depth);
  }
  let selected=null, dismissed=null, candidate=null, candidateSince=0, shownKey='';
  function showInfo(item,automatic=false){
    const key=item ? item.name+automatic : '';
    if(key===shownKey)return;
    shownKey=key;$('geo-info').hidden=!item;
    if(!item)return;
    $('geo-mode').textContent=automatic?'视野附近 · '+item.type:'地理说明 · '+item.type;
    $('geo-title').textContent=item.name;
    $('geo-description').textContent=item.description;
    $('geo-meta').textContent='标注参考位置 '+item.lon+'°E / '+item.lat+'°N · 非区域边界';
  }
  function dismissInfo(){dismissed=candidate;selected=null;showInfo(null);}
  $('geo-close').onclick=dismissInfo;
  addEventListener('keydown',event=>{if(event.key==='Escape')dismissInfo();});
  const labels=geography.map(item=>{
    const el=document.createElement('button');el.type='button';
    el.className='geo-label '+(item.type==='海域'?'sea':'');el.textContent=item.name;
    el.setAttribute('aria-label',item.name+'：查看地理说明');
    el.setAttribute('aria-controls','geo-info');
    const activate=()=>{selected=item;dismissed=null;showInfo(item);};
    el.addEventListener('pointerenter',activate);el.addEventListener('focus',activate);el.addEventListener('click',activate);
    $('labels-layer').appendChild(el);return {...item,el};
  });
  let flight=null;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function fly(target,offset){
    selected=null;
    const end=target.clone().add(offset);
    if(reduced){camera.position.copy(end);controls.target.copy(target);return;}
    flight={start:performance.now(),from:camera.position.clone(),to:end,fromTarget:controls.target.clone(),target};
  }
  function selectView(id){for(const name of ['top','oblique'])$(name).classList.toggle('active',name===id);}
  function home(animate=true){
    const target=new THREE.Vector3(2,0,1);
    const distance=innerWidth<800?100:83;
    const offset=new THREE.Vector3(0,distance,distance*.43);
    if(animate)fly(target,offset);else{camera.position.copy(target).add(offset);controls.target.copy(target);}
    selectView('oblique');document.querySelectorAll('.place').forEach(b=>b.classList.remove('active'));
    $('place-note').textContent='西高东低，山河相连。';
  }
  home(false);
  function zoomBy(factor){
    selected=null;
    flight=null;
    const offset=camera.position.clone().sub(controls.target);
    const distance=THREE.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance);
    camera.position.copy(controls.target).add(offset.setLength(distance));
    controls.update();
  }
  $('zoom-in').onclick=()=>zoomBy(1/1.35);
  $('zoom-out').onclick=()=>zoomBy(1.35);
  $('reset').onclick=()=>home();
  $('top').onclick=()=>{selectView('top');fly(controls.target.clone(),new THREE.Vector3(0,camera.position.distanceTo(controls.target),.01));};
  $('oblique').onclick=()=>{selectView('oblique');const d=camera.position.distanceTo(controls.target);fly(controls.target.clone(),new THREE.Vector3(0,d*.86,d*.51));};
  $('height').oninput=e=>{exaggeration=Number(e.target.value);$('height-value').value=exaggeration+'×';setHeight();};
  $('labels').onchange=e=>{$('labels-layer').hidden=!e.target.checked;if(!e.target.checked){selected=null;showInfo(null);}};
  const places={tibet:[88,33,'平均海拔超过 4,000 米的高原，南缘为喜马拉雅山脉。'],sichuan:[104.5,30,'四周群山环抱，西侧紧邻青藏高原东缘。'],tianshan:[84,43,'横贯新疆，分隔准噶尔盆地与塔里木盆地。']};
  document.querySelectorAll('.place').forEach(button=>button.onclick=()=>{
    const [lon,lat,note]=places[button.dataset.place];fly(point(lon,lat),new THREE.Vector3(0,24,17));
    $('place-note').textContent=note;selectView('oblique');document.querySelectorAll('.place').forEach(b=>b.classList.toggle('active',b===button));
  });
  controls.addEventListener('start',()=>{flight=null;selected=null;});
  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
  const projected=new THREE.Vector3();
  function render(now){
    requestAnimationFrame(render);
    if(document.hidden)return;
    if(flight){const t=Math.min(1,(now-flight.start)/1000),s=t*t*(3-2*t);camera.position.lerpVectors(flight.from,flight.to,s);controls.target.lerpVectors(flight.fromTarget,flight.target,s);if(t===1)flight=null;}
    controls.update();renderer.render(scene,camera);
    const occupied=[];
    const distance=camera.position.distanceTo(controls.target);
    let nearest=null,nearestScore=Infinity;
    const panelBounds=document.querySelector('.panel').getBoundingClientRect();
    if(!$('labels-layer').hidden)for(const item of labels){
      const {el,lon,lat,level}=item;
      projected.copy(point(lon,lat)).project(camera);
      const x=(projected.x*.5+.5)*innerWidth,y=(-projected.y*.5+.5)*innerHeight;
      const collision=occupied.some(p=>Math.abs(p.x-x)<110&&Math.abs(p.y-y)<26);
      const blocked=x>panelBounds.left-45&&x<panelBounds.right+45&&y>panelBounds.top-16&&y<panelBounds.bottom+16;
      const eligible=level===0||(level===1&&distance<65)||(level===2&&distance<35);
      const visible=projected.z<1&&projected.z>-1&&x>20&&x<innerWidth-20&&y>90&&y<innerHeight-65&&!blocked;
      const show=visible&&eligible&&!collision;
      el.style.display=show?'block':'none';if(show){el.style.transform=`translate(-50%,-50%) translate(${x}px,${y}px)`;occupied.push({x,y});}
      const score=Math.hypot((x-innerWidth*.5)/innerWidth,(y-innerHeight*.5)/innerHeight);
      if(visible&&eligible&&score<.25&&score<nearestScore){nearest=item;nearestScore=score;}
    }
    const next=distance<55?nearest:null;
    if(next!==candidate){candidate=next;candidateSince=now;dismissed=null;}
    if(!$('labels-layer').hidden){
      if(selected)showInfo(selected);
      else if(now-candidateSince>450)showInfo(candidate===dismissed?null:candidate,true);
    }
    $('north').style.transform=`rotate(${-controls.getAzimuthalAngle()*180/Math.PI}deg)`;
  }
  status.style.display='none';requestAnimationFrame(render);
} catch(error){
  console.error(error);status.replaceChildren();
  const title=document.createElement('strong');title.textContent='地形暂时未能打开';
  const note=document.createElement('p');note.textContent='请使用支持 WebGL 的浏览器，并刷新重试。'+error.message;
  status.append(title,note);
}
