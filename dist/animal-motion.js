// Autonomous wildlife: decisions are irregular; locomotion follows travelled
// distance. Inject a random source in tests, rather than seeding the live lake.
const TAU=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const ease=(current,target,rate,dt)=>current+(target-current)*(1-Math.exp(-rate*dt));

export const ANIMAL_MOTION={
  deer:{speed:[.44,.78],acceleration:.70,turn:1.35,stride:.78,radius:.39,space:1.05,notice:12,shy:6.5,idle:[2,5],walk:[3.0,6.2],actions:['graze','graze','graze','look','rest']},
  fox:{speed:[.38,.72],acceleration:.95,turn:1.9,stride:.46,radius:.25,space:.70,notice:10,shy:5.6,idle:[1.2,3.6],walk:[2.0,5.3],actions:['sniff','sniff','look','rest']},
  rabbit:{speed:[.36,.68],acceleration:1.5,turn:2.7,stride:.40,radius:.17,space:.52,notice:9,shy:5.8,idle:[1.0,3.6],walk:[1.1,3.2],actions:['forage','forage','groom','look']},
  duck:{speed:[.23,.42],acceleration:.64,turn:1.8,stride:.24,radius:.19,space:.63,notice:8,shy:4.7,idle:[1.3,3.8],walk:[1.8,4.0],actions:['forage','forage','preen','look']},
  turtle:{speed:[.045,.085],acceleration:.15,turn:.7,stride:.12,radius:.17,space:.40,notice:5,shy:2.5,idle:[3,8],walk:[.9,2.1],actions:['bask','bask','look']},
};

function segmentDistance(a,b,p){
  const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
  const u=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(length||1),0,1);
  return Math.hypot(a.x+u*dx-p.x,a.z+u*dz-p.z);
}

export function createAnimalMotion({species,x,z,heading=0,scale=1,stride,random=Math.random}){
  const config=ANIMAL_MOTION[species];
  if(!config)throw new Error(`Unknown wildlife motion: ${species}`);
  const between=(a,b)=>a+(b-a)*random();
  const radius=config.radius*scale;
  const bounds={x:9.45-radius,z:6.35-radius};
  const strideLength=(stride||config.stride)*scale;
  const nominalSpeed=between(...config.speed)*Math.sqrt(scale);
  const state={species,x,z,heading,speed:0,vx:0,vz:0,phase:random()*TAU,distance:0,
    behavior:'walk',target:null,actions:0,locomotion:0,graze:0,lookYaw:0,lookPitch:0,
    earAlert:0,tailSway:0,breath:0,hop:0,blink:0,alert:0,radius,scale};
  let remaining=0,reactionCooldown=between(0,2),wasClose=false,turnVelocity=0;
  let gazeTimer=between(.4,2),gazeTarget=between(-.55,.55),tailTarget=0;
  let blinkTimer=between(1,6),blinkAge=-1,earTimer=between(.5,5),earAge=-1;
  let breathPhase=random()*TAU,breathRate=between(1.1,2.0),desiredSpeed=nominalSpeed;
  let turnTarget=heading,blockedTime=0;

  const inside=p=>(p.x/bounds.x)**2+(p.z/bounds.z)**2<=1;
  const clear=(a,b,obstacles)=>inside(b)&&obstacles.every(o=>{
    const clearance=o.radius+radius+.10,closest=segmentDistance(a,b,o);
    if(closest>clearance)return true;
    // A larger YAML animal can begin within a rock's clearance. Let it walk
    // steadily out of that overlap, without taking a shortcut through the rock.
    const from=Math.hypot(a.x-o.x,a.z-o.z),to=Math.hypot(b.x-o.x,b.z-o.z);
    return from<=clearance&&to>from+1e-8&&closest>=from-1e-8;
  });
  function idle(forced){
    state.behavior=forced||config.actions[Math.floor(random()*config.actions.length)];
    remaining=between(...config.idle);state.target=null;state.actions++;
  }
  function chooseWalk(context,away=false){
    const {obstacles=[],neighbors=[],boat}=context;
    const start={x:state.x,z:state.z},currentAngle=Math.atan2(state.z/bounds.z,state.x/bounds.x);
    const currentRadius=Math.hypot(state.x/bounds.x,state.z/bounds.z);
    let best=null,bestScore=-Infinity;
    const range=between(...config.walk)*Math.sqrt(scale);
    for(let attempt=0;attempt<30;attempt++){
      // Short journeys around the open shore, with some trips toward the grass.
      const angle=currentAngle+between(-.95,.95);
      const ring=clamp(currentRadius+between(-.18,.15),.56,.97);
      const candidate={x:Math.cos(angle)*bounds.x*ring,z:Math.sin(angle)*bounds.z*ring};
      const distance=Math.hypot(candidate.x-state.x,candidate.z-state.z);
      if(distance<Math.min(.6,range*.4)||distance>range*1.5||!clear(start,candidate,obstacles))continue;
      let score=-Math.abs(distance-range)+random()*.8;
      if(away&&boat)score+=Math.hypot(candidate.x-boat.x,candidate.z-boat.z)*2;
      // Ducks loosely follow the flock, while retaining their own destination.
      if(species==='duck'){
        const flock=neighbors.filter(n=>n!==state&&n.species==='duck');
        if(flock.length){const cx=flock.reduce((sum,n)=>sum+n.x,0)/flock.length,cz=flock.reduce((sum,n)=>sum+n.z,0)/flock.length;
          score-=Math.abs(Math.hypot(candidate.x-cx,candidate.z-cz)-1.25)*.45;}
      }
      for(const other of neighbors)if(other!==state){
        const gap=Math.hypot(candidate.x-other.x,candidate.z-other.z);
        if(gap<other.radius+radius+.35)score-=5;
      }
      if(score>bestScore){best=candidate;bestScore=score;}
    }
    if(!best){idle('look');remaining=between(.5,1.2);return;}
    state.target=best;state.behavior=away?'retreat':'walk';state.actions++;
    desiredSpeed=nominalSpeed*between(.82,1.18)*(away?1.45:1);
    remaining=Math.hypot(best.x-state.x,best.z-state.z)/desiredSpeed*2+5;blockedTime=0;
  }

  function step(dt,context){
    remaining-=dt;reactionCooldown-=dt;gazeTimer-=dt;blinkTimer-=dt;earTimer-=dt;
    const {boat,neighbors=[],obstacles=[]}=context;
    const boatDistance=boat?Math.hypot(boat.x-state.x,boat.z-state.z):Infinity;
    const close=boatDistance<config.notice;
    const approaching=close&&!wasClose;
    if(!close&&boatDistance>config.notice+2)wasClose=false;
    if(approaching&&reactionCooldown<=0){
      wasClose=true;reactionCooldown=between(9,18);
      if(boatDistance<config.shy&&Math.abs(boat.speed||0)>1.2&&species!=='turtle')chooseWalk(context,true);
      else{idle('alert');remaining=between(1.2,2.8);}
    } else if(state.behavior!=='retreat'&&boatDistance<config.shy&&Math.abs(boat?.speed||0)>2&&reactionCooldown<=0){
      chooseWalk(context,true);reactionCooldown=between(12,20);
    }
    if(remaining<=0){
      if(state.target)idle();else chooseWalk(context);
    }
    if(gazeTimer<=0){
      gazeTarget=between(-.6,.6);tailTarget=between(-.16,.16);gazeTimer=between(1.4,4.8);
      breathRate=between(1.1,2.0);
    }
    if(blinkTimer<=0&&blinkAge<0){blinkAge=0;blinkTimer=between(2.7,8);}
    if(earTimer<=0){earAge=0;earTimer=between(2.5,8.5);}

    let speedTarget=0;
    if(state.target){
      const dx=state.target.x-state.x,dz=state.target.z-state.z,distance=Math.hypot(dx,dz);
      if(distance<.12*scale){idle();}
      else{
        let steerX=dx/distance,steerZ=dz/distance;
        // Predictive separation smooths encounters before bodies overlap.
        for(const other of neighbors)if(other!==state){
          const sx=state.x-other.x,sz=state.z-other.z,gap=Math.hypot(sx,sz);
          const personal=radius+other.radius+config.space*.5;
          if(gap<personal*1.5&&gap>.0001){const weight=clamp((personal*1.5-gap)/personal,0,1)*1.1;
            steerX+=sx/gap*weight;steerZ+=sz/gap*weight;}
        }
        for(const obstacle of obstacles){
          const sx=state.x-obstacle.x,sz=state.z-obstacle.z,gap=Math.hypot(sx,sz),safe=obstacle.radius+radius+.24;
          if(gap<safe+.6&&gap>.0001){const weight=(safe+.6-gap)/.6;
            steerX+=sx/gap*weight;steerZ+=sz/gap*weight;}
        }
        turnTarget=Math.atan2(steerX,steerZ);
        const difference=angleDelta(turnTarget,state.heading);
        const maxSpeed=desiredSpeed*Math.max(.12,Math.cos(difference));
        speedTarget=Math.min(maxSpeed,Math.sqrt(2*config.acceleration*Math.max(0,distance-.06)));
        // Rabbits travel in connected bounds, rather than sliding under a hop.
        if(species==='rabbit')speedTarget*=.70+.30*Math.sin(state.phase*.5)**2;
      }
    }
    const difference=angleDelta(turnTarget,state.heading);
    const targetTurn=state.target?clamp(difference*2.4,-config.turn,config.turn):0;
    turnVelocity=ease(turnVelocity,targetTurn,5,dt);
    const yawStep=turnVelocity*dt;
    state.heading=angleDelta(state.heading+yawStep,0);
    const speedChange=clamp(speedTarget-state.speed,-config.acceleration*dt*1.5,config.acceleration*dt);
    state.speed=Math.max(0,state.speed+speedChange);
    const nx=state.x+Math.sin(state.heading)*state.speed*dt,nz=state.z+Math.cos(state.heading)*state.speed*dt;
    const proposed={x:nx,z:nz};
    const safe=clear(state,proposed,obstacles)&&neighbors.every(other=>other===state||
      Math.hypot(nx-other.x,nz-other.z)>=radius+other.radius+.06||
      Math.hypot(nx-other.x,nz-other.z)>Math.hypot(state.x-other.x,state.z-other.z));
    const previousX=state.x,previousZ=state.z;
    if(safe){state.x=nx;state.z=nz;blockedTime=0;}
    else{state.speed=ease(state.speed,0,12,dt);blockedTime+=dt;if(blockedTime>.35){chooseWalk(context);blockedTime=0;}}
    const travelled=Math.hypot(state.x-previousX,state.z-previousZ);
    state.distance+=travelled;state.vx=(state.x-previousX)/dt;state.vz=(state.z-previousZ)/dt;
    const turningStep=state.target?Math.abs(yawStep)*radius*.3:0;
    state.phase=(state.phase+(travelled+turningStep)/strideLength*TAU)%TAU;
    const actualSpeed=travelled/dt;
    state.locomotion=ease(state.locomotion,clamp((actualSpeed+turningStep/dt)/nominalSpeed,0,1),7,dt);
    const feeding=['graze','sniff','forage','groom','preen'].includes(state.behavior);
    state.graze=ease(state.graze,feeding?1:0,2.6,dt);
    state.alert=ease(state.alert,state.behavior==='alert'||state.behavior==='retreat'?1:0,3,dt);
    let gaze=gazeTarget*(feeding?.18:1);
    if(boat&&close&&(state.alert>.1||state.behavior==='look'))gaze=angleDelta(Math.atan2(boat.x-state.x,boat.z-state.z),state.heading);
    state.lookYaw=ease(state.lookYaw,clamp(gaze,-.65,.65),3.1,dt);
    state.lookPitch=ease(state.lookPitch,feeding?.12:state.alert>0.2?-.06:0,2.5,dt);
    if(blinkAge>=0){blinkAge+=dt;state.blink=Math.sin(clamp(blinkAge/.18,0,1)*Math.PI)**2;if(blinkAge>=.18){blinkAge=-1;state.blink=0;}}
    if(earAge>=0){earAge+=dt;if(earAge>.38)earAge=-1;}
    const twitch=earAge<0?0:Math.sin(earAge/.38*Math.PI)*.45;
    state.earAlert=ease(state.earAlert,clamp(state.alert+twitch,0,1),12,dt);
    state.tailSway=ease(state.tailSway,clamp(-turnVelocity*.18+tailTarget,-.4,.4),3,dt);
    breathPhase=(breathPhase+breathRate*dt)%TAU;state.breath=Math.sin(breathPhase);
    state.hop=species==='rabbit'?Math.sin(state.phase*.5)**2*.065*state.locomotion:0;
  }
  function update(dt,context={}){
    if(!(dt>0))return state;
    // Fixed maximum substep prevents tunnelling and keeps steering frame-rate independent.
    const duration=Math.min(dt,.25),steps=Math.ceil(duration/(1/60));
    for(let i=0;i<steps;i++)step(duration/steps,context);
    return state;
  }
  return {state,update,bounds,snapshot:()=>({...state,target:state.target?{...state.target}:null})};
}
