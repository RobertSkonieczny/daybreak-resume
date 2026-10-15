import * as THREE from './vendor/three.module.js';
import {createWaveField, WAVE_COUNT, RIPPLE_COUNT, WATER_LEVEL} from './wave-field.js';

// Dense in the area a seated visitor can inspect, increasingly sparse at the
// horizon. A continuous grid avoids the cracks of separate water LOD rings.
export function createLakeWater({renderer, scene, sunDirection, islands, mobile = false, sky}) {
  const field = createWaveField();
  const segments = mobile ? 192 : 256;
  const geometry = new THREE.PlaneGeometry(2, 2, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const stretch = n => Math.sign(n) * (42 * Math.abs(n) + 1250 * Math.abs(n) ** 5);
  for (let i = 0; i < position.count; i++) position.setXYZ(i, stretch(position.getX(i)), 0, stretch(position.getZ(i)));
  geometry.computeBoundingSphere();

  const hdr = renderer.extensions.has('EXT_color_buffer_float');
  const targetOptions = {type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false};
  const reflection = new THREE.WebGLRenderTarget(1, 1, targetOptions);
  reflection.texture.generateMipmaps=true;reflection.texture.minFilter=THREE.LinearMipmapLinearFilter;
  const refraction = new THREE.WebGLRenderTarget(1, 1, targetOptions);
  refraction.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  const reflectedCamera = new THREE.PerspectiveCamera();
  const textureMatrix = new THREE.Matrix4();
  const normal = new THREE.Vector3(0, 1, 0), target = new THREE.Vector3();
  const plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
  const waveShape = field.waves.map(w => new THREE.Vector4(w.dx, w.dz, w.k, w.steepness));
  const waveState = field.waves.map(w => new THREE.Vector2(w.amplitude, w.phase));
  const rippleData = Array.from({length: RIPPLE_COUNT}, () => new THREE.Vector4(0, 0, -100, 0));
  const uniforms = {
    microOrigin: {value: new THREE.Vector2(field.waves[0].phase*91,field.waves[1].phase*73)},
    waveShape: {value: waveShape}, waveState: {value: waveState}, ripples: {value: rippleData},
    time: {value: 0}, eye: {value: new THREE.Vector3()}, sunDir: {value: sunDirection},
    reflectionMap: {value: reflection.texture}, refractionMap: {value: refraction.texture},
    depthMap: {value: refraction.depthTexture}, textureMatrix: {value: textureMatrix},
    viewport: {value: new THREE.Vector2()}, clipRange: {value: new THREE.Vector2(.08, 1800)},
    boatPose: {value: new THREE.Vector4(0, 16, 0, 0)},
    shores: {value: Array.from({length: Math.max(islands.length, 1)}, (_, i) =>
      new THREE.Vector4(islands[i]?.islandX ?? 9000, islands[i]?.islandZ ?? 9000, 12, 8.5))},
    fogColor: {value: scene.fog.color},
  };
  const waveGLSL = `
    uniform vec4 waveShape[${WAVE_COUNT}];
    uniform vec2 waveState[${WAVE_COUNT}];
    uniform vec4 ripples[${RIPPLE_COUNT}];
    uniform float time;
    void displace(vec2 q, float detail, out vec3 p, out vec3 tx, out vec3 tz) {
      p=vec3(q.x,${WATER_LEVEL},q.y);tx=vec3(1.,0.,0.);tz=vec3(0.,0.,1.);
      for(int i=0;i<${WAVE_COUNT};i++){
        vec4 w=waveShape[i];float amplitude=waveState[i].x;
        amplitude*=detail;
        float theta=w.z*dot(w.xy,q)+waveState[i].y;
        float s=sin(theta),c=cos(theta),qa=w.w*amplitude;
        p+=vec3(qa*w.x*c,amplitude*s,qa*w.y*c);
        float h=qa*w.z*s,v=amplitude*w.z*c;
        tx+=vec3(-h*w.x*w.x,v*w.x,-h*w.x*w.y);
        tz+=vec3(-h*w.x*w.y,v*w.y,-h*w.y*w.y);
      }
      for(int i=0;i<${RIPPLE_COUNT};i++){
        vec4 r=ripples[i];float age=time-r.z;
        vec2 d=q-r.xy;float radius=length(d),front=radius-age*1.65;
        float e=r.w*exp(-front*front*2.-age*.8)*clamp(age*5.,0.,1.);
        float phi=front*8.;p.y+=e*sin(phi);
        vec2 slope=d/max(radius,.001)*e*(8.*cos(phi)-4.*front*sin(phi));
        tx.y+=slope.x;tz.y+=slope.y;
      }
    }
  `;
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `${waveGLSL}
      uniform vec3 eye;uniform mat4 textureMatrix;
      varying vec3 vWorld;varying vec3 vNormal;varying vec4 vReflection;
      void main(){
        vec3 base=(modelMatrix*vec4(position,1.)).xyz;
        float detail=1.-smoothstep(70.,260.,length(base.xz-eye.xz));
        vec3 p,tx,tz;displace(base.xz,detail,p,tx,tz);
        vWorld=p;vNormal=normalize(cross(tz,tx));vReflection=textureMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
      }`,
    fragmentShader: `
      precision highp float;
      uniform float time;uniform vec3 eye;uniform vec3 sunDir;
      uniform sampler2D reflectionMap;uniform sampler2D refractionMap;uniform sampler2D depthMap;
      uniform vec2 viewport;uniform vec2 clipRange;uniform vec2 microOrigin;uniform vec4 boatPose;
      uniform vec4 shores[${Math.max(islands.length, 1)}];uniform vec3 fogColor;
      varying vec3 vWorld;varying vec3 vNormal;varying vec4 vReflection;
      float linearDepth(float d){float n=clipRange.x,f=clipRange.y;return n*f/(f-d*(f-n));}
      vec2 smallWaves(vec2 p){
        p+=microOrigin;vec2 slope=vec2(0.);float footprint=max(length(fwidth(p)),.001);
        for(int i=0;i<6;i++){
          float fi=float(i),k=9.+fi*8.3;
          vec2 dir=vec2(cos(fi*2.399),sin(fi*2.399));
          float bandLimit=1.-smoothstep(.45,2.8,k*footprint);
          slope+=dir*cos(dot(p,dir)*k-time*(2.1+fi*.8)+fi*7.1)*(.028-fi*.003)*bandLimit;
        }
        return slope;
      }
      float distribution(float nDotH,float roughness){
        float a=roughness*roughness,a2=a*a,d=nDotH*nDotH*(a2-1.)+1.;
        return a2/(3.14159265*d*d);
      }
      void main(){
        // Exclude the dry interior below the gunwale, including while the boat
        // heaves. This mask follows the actual narrow waterline, not a circle.
        vec2 relative=vWorld.xz-boatPose.xy;
        float c=cos(boatPose.z),s=sin(boatPose.z);
        vec2 local=vec2(c*relative.x-s*relative.y,s*relative.x+c*relative.y);
        float width=.83*sqrt(max(0.,1.-pow(abs((local.y+.10)/2.43),2.)));
        if(abs(local.x)<width&&local.y>-2.48&&local.y<2.07)discard;
        vec2 microSlope=smallWaves(vWorld.xz);
        vec3 n=normalize(vNormal+vec3(-microSlope.x,0.,-microSlope.y));
        vec3 v=normalize(eye-vWorld);float nv=max(dot(n,v),.001);
        float fresnel=.0204+.9796*pow(1.-nv,5.);
        float distanceToEye=length(eye-vWorld);
        vec2 reflectedUV=vReflection.xy/vReflection.w;
        vec3 viewNormal=mat3(viewMatrix)*(n-vec3(0.,1.,0.));
        vec2 distortion=viewNormal.xy*.065/(1.+distanceToEye*.008);
        reflectedUV=clamp(reflectedUV+distortion,vec2(.001),vec2(.999));
        vec3 reflected=texture2DLodEXT(reflectionMap,reflectedUV,.45+min(distanceToEye*.004,.75)).rgb;
        vec2 screenUV=gl_FragCoord.xy/viewport;
        float surfaceDepth=linearDepth(gl_FragCoord.z);
        float bottomDepth=linearDepth(texture2D(depthMap,screenUV).r);
        float opticalDepth=clamp(bottomDepth-surfaceDepth,0.,35.);
        vec2 refractedUV=clamp(screenUV+viewNormal.xy*.009*min(opticalDepth*.3,1.),vec2(.001),vec2(.999));
        float displacedDepth=linearDepth(texture2D(depthMap,refractedUV).r);
        if(displacedDepth<surfaceDepth+.05)refractedUV=screenUV;
        else opticalDepth=clamp(displacedDepth-surfaceDepth,0.,35.);
        vec3 bottom=texture2D(refractionMap,refractedUV).rgb;
        // Beer-Lambert absorption: amber shallows give way to deep blue-green.
        vec3 transmittance=exp(-vec3(.31,.13,.085)*opticalDepth);
        vec3 deep=vec3(.019,.073,.080);
        vec3 transmitted=bottom*transmittance+deep*(1.-transmittance);
        vec3 col=mix(transmitted,reflected,fresnel);
        vec3 h=normalize(sunDir+v);float nl=max(dot(n,sunDir),0.);
        float nh=max(dot(n,h),0.),vh=max(dot(v,h),0.);
        float f=.0204+.9796*pow(1.-vh,5.);
        float roughness=.16+min(length(fwidth(n))*.6,.18);
        float k=pow(roughness+1.,2.)/8.;
        float visibility=nv/(nv*(1.-k)+k)*nl/(nl*(1.-k)+k);
        float spec=distribution(nh,roughness)*f*visibility/max(4.*nv,.02);
        col+=vec3(4.8,2.7,1.15)*spec;
        float shoreDepth=30.;
        for(int i=0;i<${Math.max(islands.length, 1)};i++){
          vec4 shore=shores[i];vec2 d=(vWorld.xz-shore.xy)/shore.zw;
          float ground=-1.8+3.3*sqrt(max(0.,1.-dot(d,d)));
          shoreDepth=min(shoreDepth,max(vWorld.y-ground,0.));
        }
        // Only a trace of foam on wavelets reaching the beach.
        float edge=(1.-smoothstep(.015,.28,shoreDepth))*smoothstep(0.,.08,shoreDepth);
        float grain=sin(vWorld.x*37.+sin(vWorld.z*22.))*sin(vWorld.z*43.-time*1.7);
        col=mix(col,vec3(.39,.43,.38),edge*.22*smoothstep(-.1,.5,grain));
        float fog=1.-exp(-pow(distanceToEye*.0022,2.));col=mix(col,fogColor,fog);
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const surface = new THREE.Mesh(geometry, material);
  surface.name = 'displaced-lake'; surface.frustumCulled = false; scene.add(surface);
  const lakebed = new THREE.Mesh(new THREE.PlaneGeometry(2700, 2700),
    new THREE.MeshStandardMaterial({color: '#42493c', roughness: 1}));
  lakebed.rotation.x = -Math.PI / 2; lakebed.position.y = -7; scene.add(lakebed);
  let passes = 0;

  function resize(width, height) {
    const scale = Math.min(1, (mobile ? 640 : 1024) / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
    reflection.setSize(w, h); refraction.setSize(w, h);
  }
  resize(innerWidth, innerHeight);

  function update(dt, boat) {
    field.update(dt);
    uniforms.time.value = field.time;
    field.waves.forEach((w, i) => waveState[i].set(w.amplitude, w.phase));
    rippleData.forEach((r, i) => {
      const impulse = field.ripples[i];
      if (impulse) r.set(impulse.x, impulse.z, impulse.born, impulse.strength);
      else r.set(0, 0, -100, 0);
    });
    surface.position.set(boat.x, 0, boat.z);
    uniforms.boatPose.value.set(boat.x, boat.z, boat.heading, 0);
  }

  function render(camera, boat) {
    scene.updateMatrixWorld();camera.updateMatrixWorld();
    uniforms.eye.value.copy(camera.position);
    uniforms.clipRange.value.set(camera.near,camera.far);
    renderer.getDrawingBufferSize(uniforms.viewport.value);
    reflectedCamera.copy(camera);
    reflectedCamera.position.copy(camera.position); reflectedCamera.position.y = 2 * WATER_LEVEL - camera.position.y;
    camera.getWorldDirection(target).add(camera.position); target.y = 2 * WATER_LEVEL - target.y;
    reflectedCamera.up.copy(camera.up).reflect(normal);
    reflectedCamera.lookAt(target); reflectedCamera.updateMatrixWorld();
    textureMatrix.set(.5,0,0,.5, 0,.5,0,.5, 0,0,.5,.5, 0,0,0,1);
    textureMatrix.multiply(reflectedCamera.projectionMatrix).multiply(reflectedCamera.matrixWorldInverse);
    // Oblique clipping keeps submerged terrain out of the reflected image;
    // allow troughs to reveal the shoreline slightly below the mean plane.
    plane.setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(0, WATER_LEVEL - .48, 0));
    plane.applyMatrix4(reflectedCamera.matrixWorldInverse);
    clip.set(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
    const p = reflectedCamera.projectionMatrix.elements;
    q.set((Math.sign(clip.x)+p[8])/p[0],(Math.sign(clip.y)+p[9])/p[5],-1,(1+p[10])/p[14]);
    clip.multiplyScalar(2/clip.dot(q));
    p[2]=clip.x;p[6]=clip.y;p[10]=clip.z+1-.001;p[14]=clip.w;
    reflectedCamera.projectionMatrixInverse.copy(reflectedCamera.projectionMatrix).invert();
    const previousTarget=renderer.getRenderTarget(),xr=renderer.xr.enabled;
    const shadowAuto=renderer.shadowMap.autoUpdate, boatVisible=boat.visible;
    const sunDisk=sky?.material.uniforms.sunDisk;
    const originalDisk=sunDisk?.value;
    try {
      surface.visible=false;boat.visible=false;renderer.xr.enabled=false;
      // Shadows are updated once in the main pass, then reused in both textures.
      renderer.shadowMap.autoUpdate=false;
      if(sunDisk)sunDisk.value=0;
      renderer.setRenderTarget(reflection);renderer.clear();renderer.render(scene,reflectedCamera);
      if(sunDisk)sunDisk.value=originalDisk;
      renderer.setRenderTarget(refraction);renderer.clear();renderer.render(scene,camera);
      passes+=2;
    } finally {
      surface.visible=true;boat.visible=boatVisible;renderer.xr.enabled=xr;
      renderer.shadowMap.autoUpdate=shadowAuto;renderer.setRenderTarget(previousTarget);
      if(sunDisk)sunDisk.value=originalDisk;
    }
  }
  return {update, render, resize, sample: field.sample, splash: field.splash,
    snapshot: () => ({...field.snapshot(), vertices: position.count, reflection: true,
      refraction: true, hdr, passes, textureSize: [reflection.width,reflection.height],
      heightAtBoat: field.sample(uniforms.boatPose.value.x,uniforms.boatPose.value.y).height}),
    dispose(){geometry.dispose();material.dispose();reflection.dispose();refraction.dispose();
      lakebed.geometry.dispose();lakebed.material.dispose();scene.remove(surface,lakebed);}};
}
