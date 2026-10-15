import * as THREE from './vendor/three.module.js';
import { loadResume, renderSection } from './resume-data.js?v=story-3';
import { createStops, islandProximity, planCourse } from './navigation.js';
import { createWildlife, islandHeight } from './wildlife.js?v=wildlife-1';
import { createLakeWater } from './lake-water.js?v=lake-1';
import { createNaturalAssets } from './natural-assets.js?v=lake-1';

const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = () => innerWidth < 761;
const fieldOfView = () => mobile()?68:64;
const rowingSpeed = 10.5;
const state = {
  started: false, heading: 0, speed: 0, x: 0, z: 16,
  target: null, course: [], pendingFocus: null, active: null, visited: new Set(), view: 'seated',
  orbit: 0, tilt: 0, ambientPaused: reducedMotion, keys: new Set(),
  distance: 0, audio: false, dragging: false, time: 0,
  sectionOpen: false, sectionProgress: 0, sectionHeading: 0,
  proximityStop: null, suppressedKeys: new Set(), contactOpen: false,
};
let resume;
const stops = [];

let renderer, scene, camera, boat, water, oars=[], book, wildlife, assets, lakeSky, sunlight;
let audioContext, audioGain, audioFilter, toastTimeout, lastTime=0, frame=0, paddlePhase=0;
const floating = [], birdFlocks = [], fireflies = [], stopMeshes=[];
const v3 = new THREE.Vector3();
const cameraGoal = new THREE.Vector3();
const lookGoal = new THREE.Vector3();
const lookCurrent = new THREE.Vector3(0,0,-10);
const sectionLook = new THREE.Vector3();
const sunDirection = new THREE.Vector3(.25,.092,-.96).normalize();
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const mapCtx = $('map').getContext('2d');

function seeded(seed=918) { return () => {seed = (seed*1664525+1013904223)>>>0; return seed/4294967296;}; }
const random = seeded();
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function material(color, opts={}) {return new THREE.MeshStandardMaterial({color, roughness:.86, metalness:0, ...opts});}
function mesh(geo, mat, parent, x=0,y=0,z=0) {
  if(mat.userData.woodGrain)assets?.prepareWoodGeometry(geo);
  const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);
  m.castShadow=m.receiveShadow=!!mat.isMeshStandardMaterial;parent.add(m);return m;
}
function box(w,h,d,mat,parent,x=0,y=0,z=0) {return mesh(new THREE.BoxGeometry(w,h,d),mat,parent,x,y,z);}
function segment(a,b,r,mat,parent,r2=r) {
  const delta = new THREE.Vector3().subVectors(b,a);
  const m=mesh(new THREE.CylinderGeometry(r2,r,delta.length(),8),mat,parent);
  m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;
}
let wood, woodLight, woodDark, trimMat;

function createSky() {
  lakeSky = new THREE.Mesh(new THREE.SphereGeometry(1400,48,24),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,uniforms:{sunDir:{value:sunDirection},sunDisk:{value:1}},
    vertexShader:`varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`precision highp float;varying vec3 vDir;uniform vec3 sunDir;uniform float sunDisk;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      float fbm(vec2 p){float n=0.,a=.5;for(int i=0;i<5;i++){n+=a*noise(p);p=mat2(1.6,-1.2,1.2,1.6)*p;a*=.5;}return n;}
      void main(){
        vec3 d=normalize(vDir);float h=max(d.y,0.),sd=max(dot(d,sunDir),0.);
        vec3 col=mix(vec3(.62,.47,.33),vec3(.085,.20,.36),pow(smoothstep(0.,.85,h),.48));
        col+=vec3(1.0,.42,.13)*pow(sd,12.)*exp(-h*2.);
        col+=vec3(.60,.26,.075)*pow(sd,220.);
        vec2 cloudUV=d.xz/max(d.y+.18,.05)*1.4;
        float cloud=fbm(cloudUV*vec2(.6,1.3)+vec2(4.,8.));
        float veil=smoothstep(.58,.8,cloud)*smoothstep(.02,.14,h)*.38;
        col=mix(col,vec3(.58,.56,.53)+vec3(.20,.09,.025)*pow(sd,8.),veil);
        float disc=smoothstep(.999959,.999975,sd);
        col+=vec3(13.,9.,4.8)*disc*sunDisk;
        col=mix(col,vec3(.30,.34,.33),smoothstep(0.,.15,-d.y));
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  scene.add(lakeSky);
  const pmrem=new THREE.PMREMGenerator(renderer);
  scene.environment=pmrem.fromScene(scene,.04,.1,1800).texture;
  scene.environmentIntensity=.72;pmrem.dispose();
}

function createMountainRing() {
  // Layered ridges have real depth and normals, with mottled forest and granite.
  for(let layer=0;layer<4;layer++) {
    const radius=260+layer*105, points=256, rows=6, pos=[], indices=[], colors=[];
    const forest=new THREE.Color(['#273d34','#33483e','#43554a','#526155'][layer]);
    const stone=new THREE.Color('#84867b'), color=new THREE.Color();
    for(let row=0;row<rows;row++)for(let i=0;i<=points;i++) {
      const theta=i/points*Math.PI*2;
      const ridge=16+layer*5+Math.pow(Math.sin(theta*3.2+layer*1.7)*.5+.5,2)*34+Math.sin(theta*9+layer)*5+Math.sin(theta*23.3)*2.5;
      const rise=[0,.4,1,.73,.3,0][row],r=radius-55+row*31;
      const height=-2+ridge*rise;
      pos.push(Math.sin(theta)*r,height,Math.cos(theta)*r);
      color.copy(forest).lerp(stone,Math.max(0,(height-28)/80)).multiplyScalar(.85+.15*Math.sin(theta*57+row*3));
      colors.push(color.r,color.g,color.b);
      if(row<rows-1&&i<points){const n=row*(points+1)+i;indices.push(n,n+points+1,n+1,n+1,n+points+1,n+points+2);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
    const m=mesh(g,material('#ffffff',{vertexColors:true,side:THREE.DoubleSide,roughness:1}),scene);m.castShadow=false;
  }
  for(let i=0;i<230;i++) {
    const a=i/230*Math.PI*2,r=217+random()*17;
    assets.createPine(Math.sin(a)*r,Math.cos(a)*r,5+random()*10,scene,.1,{far:true});
  }
}

function createIsland(stop,index) {
  const island=new THREE.Group();island.position.set(stop.islandX,0,stop.islandZ);scene.add(island);
  const base=mesh(new THREE.SphereGeometry(1,64,32),assets.sand,island,0,-1.8,0);base.scale.set(12,3.3,8.5);
  const soil=mesh(new THREE.SphereGeometry(1,64,32),assets.ground,island,0,-1,0);soil.scale.set(10.6,3,7.2);
  base.castShadow=soil.castShadow=false;
  const animalPositions=wildlife.populateIsland(island,stop,index),obstacles=[];
  for(let j=0;j<12;j++) {
    let a=random()*Math.PI*2,r=2+random()*6,x=Math.cos(a)*r,z=Math.sin(a)*r*.55;
    if(animalPositions.some(p=>Math.hypot(x-p.x,z-p.z)<3)){x*=-.7;z*=-.7;}
    const height=5+random()*6;
    assets.createPine(x,z,height,island,islandHeight(x,z)-.08);obstacles.push({x,z,radius:height*.055});
  }
  for(let j=0;j<16;j++){
    const a=random()*Math.PI*2,x=Math.cos(a)*10,z=Math.sin(a)*7,size=.35+random()*.85;
    if(animalPositions.some(p=>Math.hypot(x-p.x,z-p.z)<p.radius+size*.85+.25))continue;
    assets.createRock(x,z,size,island,islandHeight(x,z)-.20);obstacles.push({x,z,radius:size*.85});
  }
  wildlife.setIslandObstacles(stop.section.id,obstacles);
  assets.dressIsland(island,index,animalPositions);
  // A small dock points from each shore toward its navigable marker.
  const dock=new THREE.Group();dock.position.set(stop.x,0,stop.z);dock.rotation.y=Math.atan2(stop.islandX-stop.x,stop.islandZ-stop.z);scene.add(dock);
  for(let i=0;i<12;i++)box(2.15,.14,.37,i%3===0?woodLight:wood,dock,0,.34,i*.4+.8);
  for(let side of [-1,1])for(let z of [1,4.8]){mesh(new THREE.CylinderGeometry(.12,.15,1.4,12),woodDark,dock,side,.20,z);mesh(new THREE.CylinderGeometry(.16,.16,.07,8),woodLight,dock,side,.94,z);}
  const lamp=mesh(new THREE.CylinderGeometry(.04,.06,2.2,7),woodDark,dock,-.85,1.2,1.1);
  box(.34,.46,.34,material('#fae3a2',{emissive:'#faca6a',emissiveIntensity:1.7}),dock,-.85,2.38,1.1);
  const cap=mesh(new THREE.ConeGeometry(.28,.16,4),woodDark,dock,-.85,2.69,1.1);cap.rotation.y=Math.PI/4;
  const light=new THREE.PointLight('#ffce87',7,9,2);light.position.set(-.85,2.5,1.1);dock.add(light);
  // A slim warm beacon appears at the landing, without blocking the landscape.
  const ring=mesh(new THREE.RingGeometry(.75,.80,48),new THREE.MeshBasicMaterial({color:'#f1cd8d',transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false}),scene,stop.x,.03,stop.z-1.2);
  ring.rotation.x=-Math.PI/2;stopMeshes.push(ring);
  const el=document.createElement('button');el.className='waypoint';el.setAttribute('aria-label',`Row to ${stop.name}`);el.innerHTML='<span class="number"></span><span class="label"></span><span class="pin"></span>';el.querySelector('.number').textContent=String(index+1).padStart(2,'0');el.querySelector('.label').textContent=stop.name.toUpperCase();el.addEventListener('click',()=>navigate(index));$('waypoints').append(el);stop.element=el;
}

function buildHull() {
  const b = new THREE.Group();
  const control=[[-.08,-2.62],[-.57,-2.1],[-.96,-1.30],[-1.08,-.35],[-1.05,.7],[-.87,1.7],[-.6,2.15],[.6,2.15],[.87,1.7],[1.05,.7],[1.08,-.35],[.96,-1.30],[.57,-2.1],[.08,-2.62]];
  const curve=new THREE.CatmullRomCurve3(control.map(([x,z])=>new THREE.Vector3(x,0,z)),true,'centripetal');
  const outline=curve.getSpacedPoints(96).slice(0,-1).map(p=>[p.x,p.z]);
  for(let layer=0;layer<4;layer++){
    let lower=layer/4,upper=(layer+1)/4, pos=[],idx=[];
    for(let i=0;i<outline.length;i++){
      let a=outline[i],c=outline[(i+1)%outline.length],base=pos.length/3;
      for(let [p,t] of [[a,lower],[c,lower],[c,upper],[a,upper]]){pos.push(p[0]*(.5+t*.5),-.16+t*.84,p[1]*(.89+t*.11));}
      idx.push(base,base+1,base+2,base,base+2,base+3);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();
    const hullMaterial=(layer%2?woodLight:wood).clone();hullMaterial.side=THREE.DoubleSide;
    assets.prepareWoodGeometry(g,'z');mesh(g,hullMaterial,b);
  }
  // Real boards, interior ribs, benches, brass oarlocks, and a curved gunwale.
  for(let j=0;j<7;j++) {let x=(j-3)*.205;box(.193,.09,3.53-Math.abs(x)*1.3,j%2?wood:woodLight,b,x,.07,.05);}
  for(let z of [-1.65,-.9,0,.9,1.6]){let w=Math.abs(z)>1.5?.67:.95;segment(new THREE.Vector3(-w,.52,z),new THREE.Vector3(-w*.65,.08,z),.047,woodDark,b);segment(new THREE.Vector3(w,.52,z),new THREE.Vector3(w*.65,.08,z),.047,woodDark,b);}
  const rim=outline.map(p=>new THREE.Vector3(p[0],.69,p[1]));rim.push(rim[0].clone());
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim),150,.055,10,false),trimMat,b);
  box(1.86,.13,.42,woodLight,b,0,.49,.48);box(1.50,.13,.42,woodLight,b,0,.51,-1.13);box(1.23,.14,.46,wood,b,0,.5,1.73);
  const bow=new THREE.Shape();bow.moveTo(-.05,-2.45);bow.lineTo(-.53,-1.9);bow.lineTo(.53,-1.9);bow.lineTo(.05,-2.45);bow.closePath();const bowM=mesh(new THREE.ShapeGeometry(bow),woodLight,b);bowM.rotation.x=Math.PI/2;bowM.position.y=.64;
  // Coiled rope near the bow.
  const rope=material('#c3b78f');for(let i=0;i<4;i++){const coil=mesh(new THREE.TorusGeometry(.13+i*.029,.016,5,22),rope,b,.08,.57+i*.025,-1.57);coil.rotation.x=Math.PI/2;}
  for(let side of [-1,1]){
    mesh(new THREE.TorusGeometry(.075,.019,6,12),assets.brass,b,side*1.055,.76,.30);
    const pivot=new THREE.Group();pivot.position.set(side*.98,.77,.30);b.add(pivot);
    segment(new THREE.Vector3(-side*.61,0,0),new THREE.Vector3(side*2.55,-.25,.12),.034,woodLight,pivot);
    const blade=box(.38,.075,.92,trimMat,pivot,side*2.55,-.27,.12);blade.rotation.y=side*Math.PI/2;
    segment(new THREE.Vector3(-side*.66,0,0),new THREE.Vector3(-side*.30,0,0),.047,woodDark,pivot);
    oars.push({pivot,side,blade});
  }
  return b;
}

function createContactBook() {
  book=new THREE.Group();book.name='contact-book';book.position.set(.20,.64,-1.25);book.rotation.y=-.12;book.scale.setScalar(.68);boat.add(book);
  const leather=material('#224b43'),pages=material('#e9dfbf');
  box(.84,.035,1.04,leather,book,0,0,0);
  box(.78,.10,.98,pages,book,.018,.07,0);
  box(.84,.035,1.04,leather,book,0,.14,0);
  box(.05,.16,1.04,leather,book,-.40,.06,0);
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=512;
  const c=canvas.getContext('2d');c.fillStyle='#244b42';c.fillRect(0,0,384,512);
  c.strokeStyle='#beaa71';c.lineWidth=3;c.strokeRect(28,28,328,456);c.lineWidth=1;c.strokeRect(37,37,310,438);
  c.textAlign='center';c.fillStyle='#ebd7a4';c.font='22px Georgia';c.fillText('A LITTLE',192,166);c.font='38px Georgia';c.fillText('CONTACT',192,222);c.fillText('BOOK',192,273);
  c.font='18px Georgia';c.fillText('LET’S CONNECT',192,388);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const cover=mesh(new THREE.PlaneGeometry(.82,1.02),new THREE.MeshStandardMaterial({map:texture,roughness:.9}),book,0,.16,0);cover.rotation.x=-Math.PI/2;
  box(.08,.01,.25,material('#c79359'),book,.23,.006,.58);
}

function bookAtPointer(event) {
  const rect=renderer.domElement.getBoundingClientRect();
  pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
  raycaster.setFromCamera(pointer,camera);
  return raycaster.intersectObject(book,true).length>0;
}

function openContactBook() {
  startJourney();cancelCourse();state.speed=0;
  for(const key of state.keys)state.suppressedKeys.add(key);
  state.keys.clear();state.sectionOpen=true;state.contactOpen=true;state.sectionHeading=state.heading;
  $('chapter-number').textContent='A NOTE FROM THE BOAT';$('chapter-title').textContent='Let’s connect.';
  renderSection($('chapter-content'),{id:'contact',type:'contact'},resume.profile);
  $('chapter-panel').dataset.section='contact';$('chapter-panel').hidden=false;
  $('chapter-panel').inert=true;$('chapter-panel').classList.remove('is-visible');document.body.classList.add('section-open');
  $('continue').replaceChildren(document.createTextNode('Back to the oars '),Object.assign(document.createElement('span'),{textContent:'↗'}));
}

function createNature() {
  // Wisps of low, transparent mist at the distant shores.
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const c=canvas.getContext('2d');const gradient=c.createRadialGradient(64,64,0,64,64,64);gradient.addColorStop(0,'rgba(246,223,175,.18)');gradient.addColorStop(1,'rgba(246,223,175,0)');c.fillStyle=gradient;c.fillRect(0,0,128,128);const tex=new THREE.CanvasTexture(canvas);
  for(let i=0;i<18;i++){const m=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,opacity:.32,depthWrite:false,fog:false}));m.position.set((random()-.5)*340,2+random()*3,-140-random()*110);m.scale.set(60+random()*50,9,1);scene.add(m);floating.push(m);}
  for(let i=0;i<9;i++){
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([-.6,0,0,0,-.12,0,.6,0,0],3));
    const bird=new THREE.Line(geo,new THREE.LineBasicMaterial({color:'#38514a',transparent:true,opacity:.75}));bird.position.set(14+i*4,18+random()*3,-95-i*3);bird.userData={origin:bird.position.clone(),phase:random()*6.28};scene.add(bird);birdFlocks.push(bird);
  }
  const moteGeo=new THREE.BufferGeometry(),pos=[];for(let i=0;i<75;i++)pos.push((random()-.5)*180,.4+random()*6,(random()-.5)*180);
  moteGeo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));const motes=new THREE.Points(moteGeo,new THREE.PointsMaterial({color:'#fce3a4',size:.085,transparent:true,opacity:.5,depthWrite:false}));scene.add(motes);fireflies.push(motes);

}

function init() {
  try {
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,mobile()?1.6:2));renderer.setSize(innerWidth,innerHeight);
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.info.autoReset=false;
    assets=createNaturalAssets(THREE,renderer);({wood,woodLight,woodDark,trim:trimMat}=assets);
    renderer.domElement.setAttribute('aria-label','Sunrise lake. Use W A S D or arrow keys to row and steer. Drag to look around.');renderer.domElement.setAttribute('tabindex','0');
    $('lake').append(renderer.domElement);renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();showToast('The lake paused. Reload the page to return to the water.');});
    scene=new THREE.Scene();scene.fog=new THREE.FogExp2('#b5bdb9',.0022);
    camera=new THREE.PerspectiveCamera(fieldOfView(),innerWidth/innerHeight,.08,1800);camera.position.set(0,1.9,16.9);lookCurrent.set(0,-.4,4);
    scene.add(new THREE.HemisphereLight('#c7dbea','#7c735b',.85));
    sunlight=new THREE.DirectionalLight('#ffdab0',3.4);sunlight.position.copy(sunDirection).multiplyScalar(230);
    sunlight.castShadow=true;sunlight.shadow.mapSize.setScalar(mobile()?1024:2048);
    Object.assign(sunlight.shadow.camera,{left:-43,right:43,top:43,bottom:-43,near:1,far:340});
    sunlight.shadow.bias=-.0002;sunlight.shadow.normalBias=.035;sunlight.shadow.radius=2;
    scene.add(sunlight,sunlight.target);
    createSky();
    water=createLakeWater({renderer,scene,sunDirection,islands:stops,mobile:mobile(),sky:lakeSky});
    wildlife=createWildlife(scene,{sampleWater:(x,z)=>water.sample(x,z).height,onSplash:(x,z,strength)=>water.splash(x,z,strength)});
    createMountainRing();stops.forEach(createIsland);
    boat=buildHull();boat.position.set(state.x,0,state.z);scene.add(boat);createContactBook();createNature();
    setupInput();$('start').disabled=false;requestAnimationFrame(animate);
    window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.fov=fieldOfView();camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,mobile()?1.6:2));water.resize(innerWidth,innerHeight);});
    window.__daybreak={getState:()=>({started:state.started,x:state.x,z:state.z,speed:state.speed,heading:state.heading,target:state.target,active:state.active,visited:[...state.visited],view:state.view,ambientPaused:state.ambientPaused,time:state.time,contactOpen:state.contactOpen,sectionOpen:state.sectionOpen,sectionProgress:state.sectionProgress,proximityStop:state.proximityStop,camera:camera.position.toArray(),boatHeight:boat.position.y,boatRotation:boat.rotation.toArray(),stops:stops.map(({name,section,x,z,islandX,islandZ})=>({name,id:section.id,x,z,islandX,islandZ}))}),getWater:()=>water.snapshot(),getWildlife:()=>wildlife.snapshot(camera,innerWidth,innerHeight),getBook:()=>{const p=book.getWorldPosition(new THREE.Vector3());p.y+=.16;p.project(camera);return {screen:[(p.x*.5+.5)*innerWidth,(-p.y*.5+.5)*innerHeight]};},renderer};
  } catch(error) {console.error('Unable to initialize the lake',error);$('fallback').hidden=false;$('intro').hidden=true;$('start').disabled=true;}
}

function showToast(message) {clearTimeout(toastTimeout);$('toast').textContent=message;$('toast').classList.add('visible');toastTimeout=setTimeout(()=>$('toast').classList.remove('visible'),4200);}
function startJourney() {
  if(state.started)return;
  state.started=true;document.body.classList.add('sailing');$('intro').classList.add('leaving');setTimeout(()=>$('intro').hidden=true,850);
  $('sailing-hud').hidden=false;$('view-controls').hidden=false;$('touch-controls').hidden=false;
  showToast(matchMedia('(pointer:coarse)').matches?'Use the arrows to row. Sections open as you approach an island.':'WASD / arrows to row · Get close to an island to open its story');
}
function setRouteUI() {
  document.querySelectorAll('[data-stop]').forEach(b=>{let i=Number(b.dataset.stop);b.classList.toggle('active',i===(state.target??state.active));b.classList.toggle('visited',state.visited.has(i));if(i===(state.target??state.active))b.setAttribute('aria-current','location');else b.removeAttribute('aria-current');});
}
function navigate(index,focus=null) {
  startJourney();hideChapter();state.keys.clear();state.target=index;state.active=null;state.orbit=0;state.tilt=0;
  state.pendingFocus=focus;
  state.course=planCourse(state,stops[index],stops);
  $('map-panel').hidden=true;$('map-toggle').setAttribute('aria-expanded','false');
  $('travel-state').textContent='ON THE WAY TO SHORE '+String(index+1).padStart(2,'0');$('travel-title').textContent=stops[index].name;$('cancel-course').hidden=false;setRouteUI();
  if(reducedMotion){state.x=stops[index].x;state.z=stops[index].z+3;state.speed=0;arrive(index);}
}
function cancelCourse() {state.target=null;state.course=[];state.pendingFocus=null;$('cancel-course').hidden=true;$('travel-state').textContent='EXPLORING THE LAKE';$('travel-title').textContent='Follow your curiosity.';setRouteUI();}
function arrive(i) {
  state.target=null;state.course=[];state.active=i;state.visited.add(i);state.speed=0;state.proximityStop=i;
  for(const key of state.keys)state.suppressedKeys.add(key);
  state.keys.clear();state.sectionOpen=true;state.contactOpen=false;state.sectionHeading=state.heading;state.orbit=0;state.tilt=0;
  $('continue').replaceChildren(document.createTextNode('On to the next shore '),Object.assign(document.createElement('span'),{textContent:'↗'}));
  $('chapter-number').textContent=`SHORE ${String(i+1).padStart(2,'0')} / ${String(stops.length).padStart(2,'0')}`;$('chapter-title').textContent=stops[i].section.title;
  const focus=state.pendingFocus;state.pendingFocus=null;
  renderSection($('chapter-content'),stops[i].section,resume.profile,{resume,focus,onExplore:reference=>{const index=stops.findIndex(stop=>stop.section.id===reference.sectionId);if(index>=0)navigate(index,reference);}});$('chapter-panel').dataset.section=stops[i].section.id;$('chapter-panel').hidden=false;
  $('chapter-panel').inert=true;$('chapter-panel').classList.remove('is-visible');document.body.classList.add('section-open');
  $('travel-state').textContent='A MOMENT AT THE SHORE';$('travel-title').textContent=stops[i].name;$('cancel-course').hidden=true;setRouteUI();
}
function hideChapter(){
  state.sectionOpen=false;state.contactOpen=false;document.body.classList.remove('section-open');
  if($('chapter-panel').contains(document.activeElement))renderer.domElement.focus({preventScroll:true});
  $('chapter-panel').classList.remove('is-visible');$('chapter-panel').hidden=true;$('chapter-panel').inert=true;
}
function closeChapter(){hideChapter();cancelCourse();}

function setupInput() {
  const chapterContent=$('chapter-content'),scrollHint=$('chapter-scroll-hint');
  const updateScrollHint=()=>{scrollHint.hidden=chapterContent.clientHeight===0||chapterContent.scrollHeight-chapterContent.clientHeight-chapterContent.scrollTop<12;};
  chapterContent.addEventListener('scroll',updateScrollHint,{passive:true});
  new ResizeObserver(updateScrollHint).observe(chapterContent);
  new MutationObserver(updateScrollHint).observe(chapterContent,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['open','hidden']});
  scrollHint.addEventListener('click',()=>{chapterContent.focus({preventScroll:true});chapterContent.scrollBy({top:Math.max(96,chapterContent.clientHeight*.65),behavior:reducedMotion?'instant':'smooth'});});
  $('start').addEventListener('click',startJourney);document.querySelectorAll('[data-stop]').forEach(b=>b.addEventListener('click',()=>navigate(Number(b.dataset.stop))));
  $('chapter-close').addEventListener('click',closeChapter);$('continue').addEventListener('click',()=>state.contactOpen?closeChapter():navigate(((state.active??-1)+1)%stops.length));$('cancel-course').addEventListener('click',()=>{cancelCourse();showToast('You have the oars.');});
  $('contact-book').addEventListener('click',openContactBook);
  $('help').addEventListener('click',()=>{state.keys.clear();$('help-dialog').showModal();});$('help-close').addEventListener('click',()=>$('help-dialog').close());$('help-done').addEventListener('click',()=>{$('help-dialog').close();startJourney();});
  $('help-dialog').addEventListener('click',e=>{if(e.target===$('help-dialog')){const r=$('help-dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('help-dialog').close();}});
  const mapToggle=(open)=>{$('map-panel').hidden=!open;$('map-toggle').setAttribute('aria-expanded',String(open));};
  $('map-toggle').addEventListener('click',()=>mapToggle($('map-panel').hidden));$('map-close').addEventListener('click',()=>mapToggle(false));
  $('map').addEventListener('click',e=>{let r=$('map').getBoundingClientRect(),x=(e.clientX-r.left)/r.width*480,y=(e.clientY-r.top)/r.height*360;let nearest=stops.map((s,i)=>({i,d:Math.hypot(toMap(s.x,s.z).x-x,toMap(s.x,s.z).y-y)})).sort((a,b)=>a.d-b.d)[0];if(nearest.d<47){navigate(nearest.i);mapToggle(false);}});
  $('motion').addEventListener('click',()=>{state.ambientPaused=!state.ambientPaused;updateMotion();});updateMotion();
  $('sound').addEventListener('click',toggleAudio);
  const accepted=['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
  window.addEventListener('keydown',e=>{
    if($('help-dialog').open||e.ctrlKey||e.metaKey||e.altKey)return;
    if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
    let k=e.key.length===1?e.key.toLowerCase():e.key;
    if(state.suppressedKeys.has(k)){e.preventDefault();return;}
    if(state.sectionOpen&&$('chapter-panel').contains(document.activeElement)&&k.startsWith('Arrow'))return;
    if(accepted.includes(k)){e.preventDefault();startJourney();state.keys.add(k);if(state.target!==null)cancelCourse();if(!$('chapter-panel').hidden)closeChapter();}
    if(k==='Escape'){closeChapter();mapToggle(false);state.keys.clear();}
  });
  window.addEventListener('keyup',e=>{const key=e.key.length===1?e.key.toLowerCase():e.key;state.keys.delete(key);state.suppressedKeys.delete(key);});
  window.addEventListener('blur',()=>{state.keys.clear();state.suppressedKeys.clear();state.dragging=false;});document.addEventListener('visibilitychange',()=>{if(document.hidden){state.keys.clear();state.suppressedKeys.clear();}});
  const canvas=renderer.domElement;let px=0,py=0,pressX=0,pressY=0,pressedBook=false;
  canvas.addEventListener('pointerdown',e=>{pressedBook=bookAtPointer(e);pressX=px=e.clientX;pressY=py=e.clientY;if(state.sectionOpen)closeChapter();state.dragging=true;canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';});
  canvas.addEventListener('pointermove',e=>{if(!state.dragging){canvas.style.cursor=bookAtPointer(e)?'pointer':'grab';return;}if(Math.hypot(e.clientX-pressX,e.clientY-pressY)>6)pressedBook=false;state.orbit=clamp(state.orbit+(px-e.clientX)*.004,-2.3,2.3);state.tilt=clamp(state.tilt+(e.clientY-py)*.003,-.45,.65);px=e.clientX;py=e.clientY;});
  canvas.addEventListener('pointerup',e=>{if(pressedBook&&Math.hypot(e.clientX-pressX,e.clientY-pressY)<6)openContactBook();pressedBook=false;});
  for(let event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{state.dragging=false;pressedBook=false;canvas.style.cursor='grab';});canvas.style.cursor='grab';
  document.querySelectorAll('[data-key]').forEach(b=>{
    b.addEventListener('pointerdown',e=>{e.preventDefault();startJourney();cancelCourse();if(!$('chapter-panel').hidden)closeChapter();state.keys.add(b.dataset.key);b.setPointerCapture(e.pointerId);});
    for(let event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>state.keys.delete(b.dataset.key));
  });
}

function updateMotion(){$('motion').setAttribute('aria-pressed',String(state.ambientPaused));$('motion').setAttribute('aria-label',state.ambientPaused?'Resume ambient motion':'Pause ambient motion');$('motion').title=state.ambientPaused?'Resume ambient motion':'Pause ambient motion';$('motion-icon').textContent=state.ambientPaused?'▷':'Ⅱ';}

async function toggleAudio() {
  try{
    if(!audioContext){
      audioContext=new (window.AudioContext||window.webkitAudioContext)();const buffer=audioContext.createBuffer(1,audioContext.sampleRate*4,audioContext.sampleRate);const samples=buffer.getChannelData(0);let last=0;
      for(let i=0;i<samples.length;i++){last=(last+Math.random()*.04-.02)/1.025;samples[i]=last*3;}
      const noise=audioContext.createBufferSource();noise.buffer=buffer;noise.loop=true;audioFilter=audioContext.createBiquadFilter();audioFilter.type='lowpass';audioFilter.frequency.value=550;audioGain=audioContext.createGain();audioGain.gain.value=0;noise.connect(audioFilter);audioFilter.connect(audioGain);audioGain.connect(audioContext.destination);noise.start();
    }
    await audioContext.resume();state.audio=!state.audio;audioGain.gain.setTargetAtTime(state.audio?.13:0,audioContext.currentTime,.4);$('sound').setAttribute('aria-pressed',String(state.audio));$('sound').setAttribute('aria-label',state.audio?'Turn off lake sounds':'Turn on lake sounds');
  }catch{showToast('Lake sounds aren’t available in this browser.');}
}

function updatePhysics(dt) {
  if(!state.started||$('help-dialog').open||state.sectionOpen)return;
  let thrust=0,turn=0;
  if(state.target!==null) {
    while(state.course.length>1&&Math.hypot(state.course[0].x-state.x,state.course[0].z-state.z)<3.5)state.course.shift();
    const s=state.course[0]||stops[state.target],dx=s.x-state.x,dz=s.z-state.z,dist=Math.hypot(dx,dz);
    if(dist<2.4&&state.course.length<=1){arrive(state.target);return;}
    const targetAngle=Math.atan2(-dx,-dz),diff=wrapAngle(targetAngle-state.heading);
    turn=clamp(diff*1.9,-1,1);thrust=clamp(dist/10,.22,1)*clamp(1-Math.abs(diff)/1.3,.12,1);
  }else {
    const k=state.keys;thrust=(k.has('w')||k.has('ArrowUp')?1:0)-(k.has('s')||k.has('ArrowDown')?.55:0);turn=(k.has('a')||k.has('ArrowLeft')?1:0)-(k.has('d')||k.has('ArrowRight')?1:0);
  }
  state.heading=wrapAngle(state.heading+turn*dt*.85);state.speed=lerp(state.speed,thrust*rowingSpeed,1-Math.exp(-dt*(thrust?1.2:1.05)));
  let nx=state.x-Math.sin(state.heading)*state.speed*dt,nz=state.z-Math.cos(state.heading)*state.speed*dt;
  // Keep the boat on the water and slide along island edges.
  for(let s of stops){let dx=(nx-s.islandX)/13,dz=(nz-s.islandZ)/10,d=Math.hypot(dx,dz);if(d<1){nx=s.islandX+dx/d*13;nz=s.islandZ+dz/d*10;state.speed*=.8;}}
  const radius=Math.hypot(nx,nz+35);if(radius>175){nx=nx/radius*175;nz=(nz+35)/radius*175-35;state.speed*=.9;if(frame%100===0)showToast('The open lake is behind you. Turn toward the shores.');}
  state.distance+=Math.hypot(nx-state.x,nz-state.z);state.x=nx;state.z=nz;
  const proximity=islandProximity(state,stops,state.proximityStop,state.target);
  if(state.proximityStop!==null&&proximity.latch===null){state.active=null;setRouteUI();}
  state.proximityStop=proximity.latch;
  if(proximity.arrival!==null)arrive(proximity.arrival);
}

let lastWake=0,lastSternWake=0,buoyancyReady=false;
function animateBoat(dt,t) {
  const sin=Math.sin(state.heading),cos=Math.cos(state.heading);
  const surface=water.sample(state.x,state.z);
  const bow=water.sample(state.x-sin*1.7,state.z-cos*1.7).height;
  const stern=water.sample(state.x+sin*1.7,state.z+cos*1.7).height;
  const port=water.sample(state.x-cos*.8,state.z+sin*.8).height;
  const starboard=water.sample(state.x+cos*.8,state.z-sin*.8).height;
  const heave=(surface.height*2+bow+stern)/4+.03;
  const pitch=clamp(Math.atan2(bow-stern,3.4)*.65,-.09,.09);
  const roll=clamp(Math.atan2(starboard-port,1.6)*.60,-.075,.075);
  const moved=Math.hypot(state.x-boat.position.x,state.z-boat.position.z);
  const turned=Math.abs(wrapAngle(state.heading-boat.rotation.y))>.000001;
  const follow=!buoyancyReady||moved>2?1:(state.ambientPaused&&moved<.000001&&!turned?0:1-Math.exp(-dt*3));
  boat.position.set(state.x,lerp(boat.position.y,heave,follow),state.z);
  boat.rotation.set(lerp(boat.rotation.x,pitch,follow),state.heading,lerp(boat.rotation.z,roll,follow),'YXZ');
  buoyancyReady=true;
  const rowing=Math.min(Math.abs(state.speed)/3,1);
  if(rowing>.015)paddlePhase+=dt*(1.8+rowing*.5);
  for(let {pivot,side} of oars){
    pivot.rotation.y=Math.sin(paddlePhase)*.38*rowing*side;
    pivot.rotation.z=side*(rowing*(-.14+.17*Math.cos(paddlePhase))+.025*(1-rowing));
  }
  if(!state.ambientPaused&&Math.abs(state.speed)>.3){
    if(t-lastWake>.32){
      lastWake=t;
      for(const {blade} of oars){
        blade.getWorldPosition(v3);
        if(v3.y<water.sample(v3.x,v3.z).height+.08)water.splash(v3.x,v3.z,.032*rowing);
      }
    }
    if(t-lastSternWake>.48){
      lastSternWake=t;water.splash(state.x+sin*2.15,state.z+cos*2.15,.017*rowing);
    }
  }
}

function updateCamera(dt,t) {
  const direction=state.sectionOpen?1:-1;
  state.sectionProgress=reducedMotion?(state.sectionOpen?1:0):clamp(state.sectionProgress+direction*dt/(state.sectionOpen?3.1:1.65),0,1);
  // The eye stays inside the boat, including during the introduction and section pans.
  v3.set(0,1.9,.9).applyAxisAngle(new THREE.Vector3(0,1,0),state.heading).add(boat.position);
  cameraGoal.copy(v3);
  const angle=state.heading+state.orbit;
  lookGoal.copy(v3).add(new THREE.Vector3(-Math.sin(angle)*12,Math.sin(state.tilt)*9-2.3,-Math.cos(angle)*12));
  if(state.sectionProgress>0){
    let pan=state.sectionHeading+.10;
    if(!state.contactOpen&&state.active!==null){
      const stop=stops[state.active];
      const shoreHeading=Math.atan2(state.x-stop.islandX,state.z-stop.islandZ);
      pan=state.sectionHeading+clamp(wrapAngle(shoreHeading-state.sectionHeading),-.22,.22);
    }
    sectionLook.copy(v3).add(new THREE.Vector3(-Math.sin(pan)*12,-1.45,-Math.cos(pan)*12));
    const p=state.sectionProgress,blend=p*p*(3-2*p);
    lookGoal.lerp(sectionLook,blend);
  }
  if(state.sectionOpen&&state.sectionProgress>=.18&&!$('chapter-panel').classList.contains('is-visible')){
    $('chapter-panel').classList.add('is-visible');$('chapter-panel').inert=false;
    if(!$('help-dialog').open)$('chapter-title').focus({preventScroll:true});
  }
  const smoothing=reducedMotion?1:1-Math.exp(-dt*2.7);camera.position.copy(cameraGoal);lookCurrent.lerp(lookGoal,smoothing);camera.lookAt(lookCurrent);
}

function projectMarkers() {
  const lookDir=new THREE.Vector3();camera.getWorldDirection(lookDir);
  stops.forEach((s,i)=>{
    v3.set(s.x,3.8,s.z);const front=v3.clone().sub(camera.position).dot(lookDir)>0;v3.project(camera);
    const x=(v3.x*.5+.5)*innerWidth,y=(-v3.y*.5+.5)*innerHeight;
    const blockedByIntro=!state.started&&x<innerWidth*(mobile()?.82:.48)&&y>innerHeight*.18&&y<innerHeight*.75;
    const visible=front&&x>40&&x<innerWidth-40&&y>105&&y<innerHeight-100&&!blockedByIntro;
    s.element.hidden=!visible||state.sectionOpen;s.element.style.left=x+'px';s.element.style.top=y+'px';s.element.style.opacity=state.active===i?.55:1;
  });
  book.getWorldPosition(v3);v3.y+=.16;
  const bookInFront=v3.clone().sub(camera.position).dot(lookDir)>0;v3.project(camera);
  const bx=(v3.x*.5+.5)*innerWidth,by=(-v3.y*.5+.5)*innerHeight;
  const bookButton=$('contact-book');
  bookButton.hidden=state.sectionOpen||!bookInFront||bx<60||bx>innerWidth-60||by<110||by>innerHeight-60;
  bookButton.style.left=bx+'px';bookButton.style.top=(by+30)+'px';
}
function toMap(x,z){
  const xs=[0,...stops.map(s=>s.islandX)],zs=[16,...stops.map(s=>s.islandZ)];
  const minX=Math.min(...xs)-18,maxX=Math.max(...xs)+18,minZ=Math.min(...zs)-18,maxZ=Math.max(...zs)+18;
  return{x:35+(x-minX)/(maxX-minX)*410,y:28+(z-minZ)/(maxZ-minZ)*304};
}
function drawMap(t) {
  const c=mapCtx;c.clearRect(0,0,480,360);c.save();
  c.strokeStyle='#d4debc10';c.lineWidth=1;for(let i=0;i<7;i++){c.beginPath();c.ellipse(240,180,60+i*30,40+i*23,-.35,0,Math.PI*2);c.stroke();}
  c.beginPath();stops.forEach((s,i)=>{const p=toMap(s.x,s.z);i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y);});c.setLineDash([3,7]);c.strokeStyle='#d3dbb94a';c.stroke();c.setLineDash([]);
  stops.forEach((s,i)=>{let p=toMap(s.islandX,s.islandZ);c.fillStyle='#53745b';c.beginPath();c.ellipse(p.x,p.y,21,15,-.4,0,Math.PI*2);c.fill();p=toMap(s.x,s.z);c.fillStyle=(state.target===i||state.active===i)?'#f5d295':'#becdae';c.beginPath();c.arc(p.x,p.y,5,0,Math.PI*2);c.fill();c.font='13px Arial';c.textAlign='center';c.fillStyle='#e0e6cd';c.fillText(s.name,p.x,p.y-14);});
  const p=toMap(state.x,state.z);c.translate(p.x,p.y);c.rotate(-state.heading);c.fillStyle='#f6d295';c.shadowColor='#ffdc99';c.shadowBlur=12;c.beginPath();c.moveTo(0,-8);c.lineTo(-5,6);c.lineTo(0,3);c.lineTo(5,6);c.closePath();c.fill();c.restore();
}

function animate(now) {
  requestAnimationFrame(animate);const dt=Math.min((now-(lastTime||now))/1000,.05);lastTime=now;
  if(document.hidden)return;
  frame++;if(!state.ambientPaused)state.time+=dt;const t=state.time;
  updatePhysics(dt);water.update(state.ambientPaused?0:dt,state);animateBoat(dt,t);updateCamera(dt,t);
  sunlight.target.position.set(state.x,0,state.z-14);sunlight.position.copy(sunlight.target.position).addScaledVector(sunDirection,230);
  if(!state.ambientPaused){
    wildlife.update(t,state);
    birdFlocks.forEach((b,i)=>{b.position.x=b.userData.origin.x+Math.sin(t*.06+i*.03)*24;b.position.y=b.userData.origin.y+Math.sin(t*.4+i)*.4;const arr=b.geometry.attributes.position;arr.setY(0,Math.sin(t*3.3+b.userData.phase)*.27);arr.setY(2,Math.sin(t*3.3+b.userData.phase)*.27);arr.needsUpdate=true;});
    fireflies[0].rotation.y=Math.sin(t*.012)*.04;
    if(audioContext&&state.audio&&frame%10===0){audioGain.gain.setTargetAtTime(.10+Math.sin(t*.55)*.025+Math.min(Math.abs(state.speed)/7,1)*.035,audioContext.currentTime,.2);audioFilter.frequency.setTargetAtTime(470+Math.sin(t*.9)*100,audioContext.currentTime,.2);}
  }
  projectMarkers();if(!$('map-panel').hidden&&frame%3===0)drawMap(t);
  renderer.info.reset();water.render(camera,boat);renderer.render(scene,camera);
}

async function boot(){
  try{
    resume=await loadResume();stops.push(...createStops(resume.sections));
    document.title=`${resume.profile.name} — ${resume.profile.headline}`;
    document.querySelector('meta[name="description"]').content=resume.profile.summary||`${resume.profile.name} — ${resume.profile.headline}`;
    $('intro-identity').textContent=`${resume.profile.name.toUpperCase()} · ${resume.profile.headline.toUpperCase()}`;
    $('resume-pdf').hidden=!resume.profile.resume_pdf;
    if(resume.profile.resume_pdf)$('resume-pdf').href=resume.profile.resume_pdf;
    $('route').replaceChildren();
    stops.forEach((stop,i)=>{
      if(i){const line=document.createElement('span');line.className='route-line';line.setAttribute('aria-hidden','true');$('route').append(line);}
      const button=document.createElement('button');button.dataset.stop=String(i);button.dataset.section=stop.section.id;
      const dot=document.createElement('span');dot.className='route-dot';dot.setAttribute('aria-hidden','true');
      const label=document.createElement('span');label.textContent=stop.name;button.append(dot,label);$('route').append(button);
    });
    setRouteUI();init();
  }catch(error){
    $('intro').hidden=true;$('content-error-detail').textContent=error.message;$('content-error').hidden=false;
  }
}
boot();
