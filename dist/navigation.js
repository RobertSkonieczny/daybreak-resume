const ORIGINAL_SHORES=[
  {x:-27,z:-17,islandX:-35,islandZ:-23},
  {x:-31,z:-63,islandX:-40,islandZ:-69},
  {x:13,z:-86,islandX:19,islandZ:-95},
  {x:50,z:-53,islandX:61,islandZ:-57},
  {x:37,z:-7,islandX:48,islandZ:-10},
];

// Layout is automatic: authors only need to edit resume content and section order.
export function createStops(sections) {
  // Contact information lives in the boat's book, not on a separate island.
  const enabled=sections.filter(s=>s.enabled!==false&&s.type!=='contact');
  const radius=Math.max(44,enabled.length*6);
  return enabled.map((section,i)=>{
    const angle=-Math.PI/3-i*Math.PI*2/enabled.length;
    let coordinates;
    if(enabled.length<=5){
      const original=ORIGINAL_SHORES[i];
      const islandX=original.islandX*.76,islandZ=-20+(original.islandZ+28)*.76;
      // Move the islands closer while preserving each dock's shoreline offset.
      coordinates={islandX,islandZ,x:islandX+original.x-original.islandX,z:islandZ+original.z-original.islandZ};
    }else coordinates={
      x:4+Math.sin(angle)*radius,z:-42+Math.cos(angle)*radius,
      islandX:4+Math.sin(angle)*(radius+11),islandZ:-42+Math.cos(angle)*(radius+11),
    };
    return {...coordinates,name:section.label||section.title,section};
  });
}

// Trigger across the whole shoreline, with extra space outside the island's mesh.
export function shoreDistance(position,stop) {
  return Math.hypot((position.x-stop.islandX)/21,(position.z-stop.islandZ)/18);
}

// The larger exit zone prevents a dismissed section from reopening at the edge.
export function islandProximity(position,stops,latchedIndex,targetIndex=null) {
  let latch=latchedIndex;
  if(latch!==null&&(!stops[latch]||shoreDistance(position,stops[latch])>1.35))latch=null;
  let nearest=null,best=1;
  stops.forEach((stop,i)=>{
    if(targetIndex!==null&&targetIndex!==i)return;
    const distance=shoreDistance(position,stop);
    if(distance<=best){nearest=i;best=distance;}
  });
  if(nearest!==null&&nearest!==latch)return {latch:nearest,arrival:nearest};
  return {latch,arrival:null};
}

// Plan guided trips through clear water, with enough room to turn around shores.
export function planCourse(position,target,stops) {
  const angle=Math.atan2((target.z-target.islandZ)/15.5,(target.x-target.islandX)/18.5);
  const goal={x:target.islandX+Math.cos(angle)*18.5,z:target.islandZ+Math.sin(angle)*15.5};
  const nodes=[{x:position.x,z:position.z},goal];
  for(const stop of stops)for(let i=0;i<16;i++){
    const a=i/16*Math.PI*2;nodes.push({x:stop.islandX+Math.cos(a)*18.5,z:stop.islandZ+Math.sin(a)*15.5});
  }
  function clear(a,b){
    return stops.every(stop=>{
      const ax=(a.x-stop.islandX)/16,az=(a.z-stop.islandZ)/13,dx=(b.x-a.x)/16,dz=(b.z-a.z)/13;
      const length=dx*dx+dz*dz;if(!length)return true;
      // A boat already beside a shore may head outward to leave its buffer.
      if(ax*ax+az*az<1&&ax*dx+az*dz>=0)return true;
      const t=Math.max(0,Math.min(1,-(ax*dx+az*dz)/length));
      return (ax+dx*t)**2+(az+dz*t)**2>=1;
    });
  }
  const cost=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),visited=new Set();cost[0]=0;
  for(let n=0;n<nodes.length;n++){
    let current=-1;
    for(let i=0;i<nodes.length;i++)if(!visited.has(i)&&(current<0||cost[i]<cost[current]))current=i;
    if(current<0||!Number.isFinite(cost[current]))break;
    if(current===1)break;visited.add(current);
    for(let next=0;next<nodes.length;next++){
      if(visited.has(next)||!clear(nodes[current],nodes[next]))continue;
      const candidate=cost[current]+Math.hypot(nodes[next].x-nodes[current].x,nodes[next].z-nodes[current].z);
      if(candidate<cost[next]){cost[next]=candidate;previous[next]=current;}
    }
  }
  if(!Number.isFinite(cost[1]))return [goal];
  const course=[];for(let i=1;i>0;i=previous[i])course.unshift(nodes[i]);
  return course;
}
