// src/editor.js
// Initializes three.js scene, renderer, camera, controls, raycasting, block placement,
// grow handles, preview and animation loop.
// This file contains most of the logic that used to be in the original app.js.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { wireUI } from "./ui.js";

const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
// increase renderer exposure slightly for a brighter overall tone
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
// add subtle exponential fog so distant objects fade naturally
scene.fog = new THREE.FogExp2(0xFFFFFF, 0.0009);

// Camera
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(12, 12, 12);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.enableDamping = true;
// Allow looking fully upward and downward by expanding polar angle limits
controls.minPolarAngle = 0.0;
controls.maxPolarAngle = Math.PI - 0.05;
controls.update();

// Lights
// brighten hemisphere and directional lights modestly for a more cheerful scene
// slightly bluish hemisphere sky for a cooler, bluer atmosphere
const hemi = new THREE.HemisphereLight(0xE6F6FF, 0x444444, 1.3);
scene.add(hemi);
// directional light with a cool tint
const dir = new THREE.DirectionalLight(0xE8F7FF, 0.9);
dir.position.set(5, 10, 7.5);
dir.castShadow = true;
scene.add(dir);
// subtle ambient fill so shadows are less harsh and overall look is lighter
const amb = new THREE.AmbientLight(0xE8F7FF, 0.14);
scene.add(amb);

// Grid + ground
export const GRID_UNIT = 3;
const GRID_SIZE = 198;
const GRID_DIVISIONS = GRID_SIZE / GRID_UNIT;
// create grid with white lines (both grid and center) so it starts white reliably
export const grid = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, 0xffffff, 0xffffff);
// SHIFT GRID UP BY +1 TO ALIGN WITH IMPORT/EXPORT BASELINE
grid.position.y = 1;
grid.position.x = GRID_UNIT / 2;
grid.position.z = GRID_UNIT / 2;
scene.add(grid);

// Ensure grid color is white and grid is visible by default in dark mode
try{
  if(grid && grid.material){
    // GridHelper uses a LineBasicMaterial; set both color and centerColor (if present) to white
    if(Array.isArray(grid.material)){
      grid.material.forEach(m=>{ try{ m.color && m.color.set('#ffffff'); m.transparent = false; m.opacity = 1.0; }catch(e){} });
    } else {
      try{ grid.material.color && grid.material.color.set('#ffffff'); }catch(e){}
      grid.material.transparent = false;
      grid.material.opacity = 1.0;
    }
  }
  // show white grid on dark floor by default
  grid.visible = true;
}catch(e){}

// Add a visible brighter ground plane under the grid
export const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  // refined dark floor: true black surface for dark theme so white grid reads clearly
  new THREE.MeshStandardMaterial({
    color: 0x000000,
    roughness: 0.78,
    metalness: 0.0,
    emissive: 0x000000,
    emissiveIntensity: 0.02
  })
);
ground.rotation.x = -Math.PI / 2;
ground.name = "ground";
// MOVE GROUND UP SO ITS SURFACE MATCHES THE NEW GRID Y (+1) WITH A VERY SMALL OFFSET
ground.position.y = 0.99; // grid at y=1, plane just beneath so raycasts hit grid/top surfaces cleanly
scene.add(ground);

// --- Clouds: flattened-white-cube clusters that drift slowly across the sky ---
const cloudGroup = new THREE.Group();
cloudGroup.name = "Clouds";
scene.add(cloudGroup);

const CLOUD_COUNT = 8;         // number of cloud clusters
const CLOUD_CLUSTER_SIZE = 28; // approximate number of small cubes per cluster (increased from 14)
// spawn clouds much farther away so they look distant
const CLOUD_AREA_RADIUS = 320; // horizontal spread radius where clouds originate
// const CLOUD_Y = 42;            // height at which clouds float
const CLOUD_Y = 64;            // raised height at which clouds float
// slower world speed for a long, gentle drift
const CLOUD_SPEED = 0.0015;     // world units per ms (very slow motion)

function makeCloudCluster(seedX = 0, seedZ = 0){
  const cluster = new THREE.Group();
  const baseCount = Math.floor(CLOUD_CLUSTER_SIZE * (0.85 + Math.random() * 1.0));
  for(let i=0;i<baseCount;i++){
    // small cubes, flattened in Y to make puffy cloud slices (made larger for puffier clouds)
    const sx = 8 + Math.random() * 34;    // increased width
    const sy = 1.5 + Math.random() * 3.0; // slightly puffier in height
    const sz = 8 + Math.random() * 34;    // increased depth
    const geom = new THREE.BoxGeometry(sx, sy, sz);
    // Use an unlit material so clouds are unaffected by scene lighting or shadows
    // start fully transparent for fade-in; opacity will be driven per-frame
    const mat = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      depthTest: true
    });
    const m = new THREE.Mesh(geom, mat);
    // scatter pieces around the cluster origin (spread increased)
    m.position.set(
      seedX + (Math.random() - 0.5) * 44,
      CLOUD_Y + (Math.random() - 0.5) * 6,
      seedZ + (Math.random() - 0.5) * 44
    );
    m.castShadow = false;
    m.receiveShadow = false;
    // subtle random rotation to avoid strict box look
    m.rotation.set(
      0,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 0.28
    );
    // give each mesh a small userData flag so we can dispose later if needed
    m.userData.__isCloud = true;
    cluster.add(m);
  }
  // slightly vary the whole cluster scale and orientation (increase overall cluster scale)
  cluster.scale.setScalar(1.1 + Math.random() * 1.0);
  cluster.userData = {
    speedMultiplier: 0.6 + Math.random() * 1.2, // per-cluster speed variance
    direction: new THREE.Vector3(1, 0, -0.3).normalize(), // movement direction
    // timing for fades
    birthTime: performance.now(),
    fadeInMs: 2200 + Math.random()*800,
    fadeOutMs: 1600 + Math.random()*1200
  };
  return cluster;
}

function initClouds(){
  // seed clusters in a horizontal band in front-left to back-right so movement looks natural
  cloudGroup.clear && cloudGroup.clear(); // safe for some three.js versions
  while(cloudGroup.children.length) {
    const c = cloudGroup.children[0];
    cloudGroup.remove(c);
    if(c.children){
      c.children.forEach(ch=>{
        if(ch.geometry) ch.geometry.dispose();
        if(ch.material) ch.material.dispose && ch.material.dispose();
      });
    }
  }
  for(let i=0;i<CLOUD_COUNT;i++){
    const angle = (i / CLOUD_COUNT) * Math.PI * 2;
    // bias radius towards the far side to spawn clusters well out in the distance
    const radius = CLOUD_AREA_RADIUS * (0.75 + Math.random() * 0.45);
    const seedX = Math.cos(angle) * radius + (Math.random() - 0.5) * 80;
    const seedZ = Math.sin(angle) * radius + (Math.random() - 0.5) * 80;
    const cluster = makeCloudCluster(seedX, seedZ);
    // set initial position and store a baseX so we can loop them when they move out of view
    cluster.position.set(0, 0, 0);
    cluster.userData.baseX = seedX;
    cluster.userData.baseZ = seedZ;
    // small random offset in world X so clusters are staggered
    cluster.userData.offset = (Math.random() - 0.5) * 80;
    cloudGroup.add(cluster);
  }
}
// initialize right away
initClouds();
// --- end clouds ---

// Groups
export const blocksGroup = new THREE.Group(); blocksGroup.name = "Blocks"; scene.add(blocksGroup);
export const growHandlesGroup = new THREE.Group(); growHandlesGroup.name = "GrowHandles"; scene.add(growHandlesGroup);
export const previewGroup = new THREE.Group(); previewGroup.name = "Preview"; scene.add(previewGroup);

// State
export let selectedMesh = null;
let isDraggingGrow = false;
let activeGrow = null;
export const PREVIEW_MAT = new THREE.MeshStandardMaterial({ color: 0x3399ff, transparent: true, opacity: 0.45, depthWrite: false, emissive: 0x2da6ff, emissiveIntensity: 0.12 });
const GROW_SPHERE_RADIUS = 0.35;

// Tool mode state (null | 'rescale' | 'paint' | 'material' | 'setting' | 'json')
let toolMode = null;
export function setToolMode(mode){
  toolMode = mode;
  // when not in rescale mode, clear any painting preview markers
  if(toolMode !== 'rescale'){
    isPainting = false;
    paintedMap.clear();
  }
  // remove grow handles when leaving rescale mode so resizing is only possible while rescale is active
  if(toolMode !== 'rescale'){
    removeGrowHandles();
  }
}

// NEW: place/installation mode flag (true = allow placement). Default ON.
export let placeMode = true;
export function setPlaceMode(on){
  placeMode = !!on;
}

// simple paint state for rescale tool
let isPainting = false;
// map to track which block ids were painted in current drag so we don't duplicate
const paintedMap = new Map();

// helper to create small blue circular marker on block center
function createPaintMarkerAt(mesh){
  if(!mesh) return;
  const id = mesh.id;
  if(paintedMap.has(id)) return;
  const r = Math.min(0.45, (mesh.userData && mesh.userData.S ? Math.min(mesh.userData.S[0], mesh.userData.S[2]) * 0.15 : 0.35));
  const geo = new THREE.CircleGeometry(r, 24);
  const mat = new THREE.MeshBasicMaterial({ color: 0x3399ff, side: THREE.DoubleSide, transparent:true, opacity:0.95 });
  const circ = new THREE.Mesh(geo, mat);
  circ.rotation.x = -Math.PI/2;
  circ.position.set(mesh.position.x, mesh.position.y + (mesh.userData && mesh.userData.S ? -mesh.userData.S[1]/2 + 0.01 : 0.01), mesh.position.z);
  circ.userData.__paintMarker = true;
  scene.add(circ);
  paintedMap.set(id, circ);
}

// remove all paint markers
export function clearPaintMarkers(){
  for(const v of paintedMap.values()){
    scene.remove(v);
    if(v.geometry) v.geometry.dispose();
    if(v.material) v.material.dispose && v.material.dispose();
  }
  paintedMap.clear();
}

// Raycaster & pointer
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// -- MATERIALS / TEXTURE LOADER --
// mapping of material name -> { tex: Texture, mat: Material }
const textureLoader = new THREE.TextureLoader();
const MATERIALS_DEFS = {
  "Brick": "/brick (2).png",
  "Cobblestone": "/자갈 (2).png",
  "Concrete": "/콘크리트 (2).png",
  "DiamondPlate": "/다이아몬드플레이트.png",
  "Fabric": "/fabric (2).png",
  "Glass": "/유리.png",
  "Granite": "/화강암 (2).png",
  "Grass": "/grass.png",
  "Ice": "/얼음 (2).png",
  "Marble": "/대리석 (2).png",
  "Metal": "/금속 (2).png",
  "Pebble": "/조약돌 (2).png",
  // Plastic should be a "no-material" default (color-only) per user request
  "Plastic": null,
  "CorrodedMetal": "/녹슨철 (2).png",
  "Sand": "/모래 (2).png",
  "Slate": "/슬레이트 (2).png",
  "Wood": "/wood (2).png",
  "WoodPlanks": "/woodplank (2).png"
};
export const materials = {}; // populated below
// currently selected override color (rgb array) — if set, tint materials when placing blocks
export let currentColorOverride = [1, 1, 1]; // 기본 색상: 흰색
export function setCurrentColorOverride(rgb){
  currentColorOverride = Array.isArray(rgb) ? rgb.slice(0,3) : null;
}
export function getCurrentColorOverride(){
  return currentColorOverride;
}

// load textures and create simple MeshStandardMaterial for each
Object.keys(MATERIALS_DEFS).forEach(name=>{
  const path = MATERIALS_DEFS[name];
  let tex = null;
  let mat = null;
  if(path){
    tex = textureLoader.load(path);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1,1);
    // default material: standard with some roughness; glass gets different settings
    if(name === "Glass"){
      mat = new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, opacity: 0.6, roughness:0.05, metalness:0.0, clearcoat:0.1 });
    } else {
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness:0.7, metalness:0.05 });
    }
  } else {
    // No texture -> represent as color-only material (null here so editor uses color override)
    tex = null;
    mat = null;
  }
  materials[name] = { texture: tex, material: mat, name };
});

// Utility helpers
// export function snap(v){
//   const unit = GRID_UNIT;
//   return Math.round(v / unit) * unit;
// }
export function snap(v, unit){
  // If no unit provided, fall back to global GRID_UNIT for backward compatibility
  unit = (typeof unit === 'number' && unit > 0) ? unit : GRID_UNIT;
  return Math.round(v / unit) * unit;
}
export function roundNum(n, d){ d = d||3; const p = Math.pow(10,d); return Math.round(n*p)/p; }

// Basic color helpers
export function hexToRgbNormalized(hex){
  hex = hex.replace('#',''); 
  if(hex.length===3) hex = hex.split('').map(s=>s+s).join(''); 
  const bigint = parseInt(hex,16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return [r/255, g/255, b/255];
}
export function rgbToHex(rgb){
  const r = Math.round((rgb[0]||0)*255);
  const g = Math.round((rgb[1]||0)*255);
  const b = Math.round((rgb[2]||0)*255);
  return '#' + [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
}

// Place block and bookkeeping
// updated: materialOrColor may be either a THREE.Material instance or an rgb array
export function placeBlockAt(px, py, pz, sx, sy, sz, materialOrColor, matName){
  const geom = new THREE.BoxGeometry(sx, sy, sz);
  let mat;
  let blockColorRgb = null; // Track color for userData.C

  if(materialOrColor && materialOrColor.isMaterial){
    // use provided material - clone to keep per-mesh state if needed
    mat = materialOrColor.clone();
    // 항상 색상 오버라이드가 있으면 재질 색상을 적용하도록 변경 (텍스처가 있어도 곱해짐)
    if(currentColorOverride && Array.isArray(currentColorOverride)){
      blockColorRgb = currentColorOverride; // Capture the color used
      const c = new THREE.Color(currentColorOverride[0], currentColorOverride[1], currentColorOverride[2]);
      if(mat.color) mat.color.copy(c); else mat.color = c.clone();
      if(typeof mat.roughness === 'number') mat.roughness = Math.min(1, Math.max(0, (mat.roughness || 0.5)));
      // Add a small emissive tint so the placed block appears closer to the picker brightness
      try {
        mat.emissive = c.clone();
        mat.emissiveIntensity = 0.25;
      } catch(e){}
    }
    // ensure texture repeats to fit block faces more nicely
    if(mat.map){
      const repeatX = Math.max(1, Math.round(sx / GRID_UNIT));
      const repeatY = Math.max(1, Math.round(sz / GRID_UNIT));
      mat.map = mat.map.clone();
      mat.map.repeat.set(repeatX, repeatY);
      mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
      mat.needsUpdate = true;
    }
  }else if(Array.isArray(materialOrColor)){
    blockColorRgb = materialOrColor; // Capture the plain color
    const col = new THREE.Color(materialOrColor[0], materialOrColor[1], materialOrColor[2]);
    // create material and add a subtle emissive to match picker brightness
    mat = new THREE.MeshStandardMaterial({ color: col.clone(), roughness:0.6, metalness:0.0 });
    mat.emissive = col.clone();
    mat.emissiveIntensity = 0.25;
  }else{
    // Default color block
    blockColorRgb = [0.95, 0.95, 0.95];
    mat = new THREE.MeshStandardMaterial({ color: 0xEDEDED, roughness:0.6 });
    // keep a small emissive so defaults match UI more closely
    mat.emissive = new THREE.Color(0xEDEDED);
    mat.emissiveIntensity = 0.12;
  }

  // --- NEW: ensure any captured blockColorRgb is normalized to 0..1 floats ---
  if(Array.isArray(blockColorRgb)){
    // If values look like 0..255 integers, convert to 0..1
    const needsDivide = blockColorRgb.some(v => typeof v === 'number' && v > 1.001);
    if(needsDivide){
      blockColorRgb = blockColorRgb.map(v => Math.max(0, Math.min(1, Number(v) / 255)));
    } else {
      // coerce to numbers and clamp 0..1
      blockColorRgb = blockColorRgb.map(v => Math.max(0, Math.min(1, Number(v) || 0)));
    }
  }

  const m = new THREE.Mesh(geom, mat);
  // place at final world position center
  // ADD A GLOBAL +1 OFFSET TO THE BASE Y (py) SO EVERY PLACED BLOCK IS OFFSET UP BY 1
  const centerY = (py + 1) + sy / 2;
  m.position.set(px, centerY, pz);
  m.userData = {
    // store exact center coordinates (avoid premature rounding that can introduce half-unit offsets)
    P: [px, centerY, pz],
    S: [Math.round(sx), Math.round(sy), Math.round(sz)],
    C: blockColorRgb ? blockColorRgb.slice(0,3).map(v=>roundNum(v,3)) : null,
    M: matName || (materialOrColor && materialOrColor.name) || null
  };
  m.castShadow = true;

  // apply any previously-stored transparency flag if present in userData (newly placed blocks won't have it)
  if(typeof m.userData.T === 'number' && m.userData.T >= 0){
    // if material supports transparency, set it
    try{
      if(m.material){
        m.material.transparent = m.userData.T < 1.0;
        m.material.opacity = Math.max(0, Math.min(1, Number(m.userData.T)));
        m.material.needsUpdate = true;
      }
    }catch(e){}
  }

  // Placement animation: start smaller and slightly lower, then ease to final scale/position.
  // We store animation meta-data in userData so animate() can tween it each frame.
  const dur = 180; // milliseconds
  const now = performance.now();
  m.userData._placeAnim = {
    startTime: now,
    duration: dur,
    // start scale (z/x same), final is 1
    fromScale: 0.28,
    toScale: 1.0,
    // slight vertical ease: start slightly below final center position
    fromYOffset: - (sy * 0.18),
    toYOffset: 0
  };
  // apply initial transform relative to stored center
  const s0 = m.userData._placeAnim.fromScale;
  m.scale.set(s0, s0, s0);
  m.position.y = centerY + m.userData._placeAnim.fromYOffset;

  blocksGroup.add(m);
  updateJSON();
  if(selectedMesh) updateHandlesPosition();
  return m;
}

// JSON export
export function updateJSON(){
  const arr = [];
  for(const m of blocksGroup.children){
    const ud = m.userData;
    if(!ud) continue;
    // use compact keys: P,S,C,M,E,T,K,A (omit defaults)
    // Export Y as editor's internal Y + 1 to match external JSON baseline
    const P = ud.P ? [ Math.round(ud.P[0]), Math.round(ud.P[1]) + 1, Math.round(ud.P[2]) ] : [0,1,0];
    const S = ud.S ? ud.S.map(v=>Math.round(v)) : [GRID_UNIT, GRID_UNIT, GRID_UNIT];
    let C = ud.C ? ud.C.slice(0,3) : null;
    const M = ud.M || null;

    // --- NEW: ensure exported color C is normalized 0..1 and rounded ---
    if(C){
      // If values appear in 0..255, normalize; otherwise clamp and round to 3 decimals
      const needsDivide = C.some(v => typeof v === 'number' && v > 1.001);
      if(needsDivide){
        C = C.map(v => Math.max(0, Math.min(1, v / 255)));
      } else {
        C = C.map(v => Math.max(0, Math.min(1, v)));
      }
      C = C.map(v => Math.round(v * 1000) / 1000);
    }

    const obj = {};
    // position & size always present
    obj.P = P.slice(0,3);
    obj.S = S.slice(0,3);
    // color if present
    if(C) obj.C = C.slice(0,3);
    // material only if not Plastic / null
    if(M) obj.M = M;

    // optional properties: only include when different from defaults
    // Defaults assumed: E=false, T=0, K=true, A=true
    if(ud.E === true) obj.E = true;
    if(typeof ud.T === 'number' && ud.T > 0) obj.T = Math.round(ud.T * 1000) / 1000;
    if(ud.K === false) obj.K = false;
    if(ud.A === false) obj.A = false;

    arr.push(obj);
  }
  const jsonOut = document.getElementById("jsonOut");
  if(jsonOut) jsonOut.value = HttpStringify(arr);
}

// small helper to stringify with stable formatting (avoid heavy whitespace)
function HttpStringify(v){
  try{
    return JSON.stringify(v);
  }catch(e){
    return "[]";
  }
}

// Grow handles & preview
export function createGrowHandlesFor(mesh){
  removeGrowHandles();
  if(!mesh) return;
  const s = mesh.userData.S ? mesh.userData.S[0] : (GRID_UNIT);
  const half = s/2;
  const center = mesh.position.clone();

  const axes = [
    {axis:'x', dir:1, pos:new THREE.Vector3(center.x + half + GROW_SPHERE_RADIUS, center.y, center.z)},
    {axis:'x', dir:-1,pos:new THREE.Vector3(center.x - half - GROW_SPHERE_RADIUS, center.y, center.z)},
    {axis:'y', dir:1, pos:new THREE.Vector3(center.x, center.y + half + GROW_SPHERE_RADIUS, center.z)},
    {axis:'y', dir:-1,pos:new THREE.Vector3(center.x, center.y - half - GROW_SPHERE_RADIUS, center.z)},
    {axis:'z', dir:1, pos:new THREE.Vector3(center.x, center.y, center.z + half + GROW_SPHERE_RADIUS)},
    {axis:'z', dir:-1,pos:new THREE.Vector3(center.x, center.y, center.z - half - GROW_SPHERE_RADIUS)}
  ];

  for(const a of axes){
    const geo = new THREE.SphereGeometry(GROW_SPHERE_RADIUS, 12, 12);
    const mat = new THREE.MeshStandardMaterial({ color:0x3399ff, emissive:0x155f99, metalness:0.2, roughness:0.4 });
    const sp = new THREE.Mesh(geo, mat);
    sp.position.copy(a.pos);
    sp.userData.handle = { axis: a.axis, dir: a.dir };
    sp.renderOrder = 999;
    growHandlesGroup.add(sp);
  }
}
export function removeGrowHandles(){
  while(growHandlesGroup.children.length){
    const c = growHandlesGroup.children[0];
    growHandlesGroup.remove(c);
    if(c.geometry) c.geometry.dispose();
    if(c.material) c.material.dispose && c.material.dispose();
  }
  while(previewGroup.children.length) {
    const c = previewGroup.children[0];
    previewGroup.remove(c);
    if(c.geometry) c.geometry.dispose();
    if(c.material) c.material.dispose && c.material.dispose();
  }
}
export function updateHandlesPosition(){
  if(!selectedMesh) return;
  createGrowHandlesFor(selectedMesh);
}

// Pointer interactions for selection, placement and grow dragging
function onPointerDown(ev){
  // ignore right-clicks here so the contextmenu handler is the sole delete action
  if(ev.button === 2) return;

  const rect = canvas.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

  // ignore clicks over UI panel
  const uiRect = document.getElementById('ui').getBoundingClientRect();
  if(ev.clientX >= uiRect.left && ev.clientX <= uiRect.right && ev.clientY >= uiRect.top && ev.clientY <= uiRect.bottom) return;

  raycaster.setFromCamera(pointer, camera);

  // FIRST: always check grow-handle intersections (so handles can start drag when rescale is active)
  const handleIntersects = raycaster.intersectObjects(growHandlesGroup.children, false);
  if(handleIntersects.length && toolMode === 'rescale'){
    const hit = handleIntersects[0];
    const h = hit.object;
    const ud = h.userData && h.userData.handle;
    if(ud && selectedMesh){
      isDraggingGrow = true;
      const axisVec = new THREE.Vector3(ud.axis==='x'?1:0, ud.axis==='y'?1:0, ud.axis==='z'?1:0);
      const startPoint = hit.point.clone();
      activeGrow = {
        axis: ud.axis,
        dir: ud.dir,
        startPoint: startPoint,
        mesh: selectedMesh,
        axisVec: axisVec,
        startCenter: selectedMesh.position.clone()
      };
      controls.enableRotate = false;
      controls.enablePan = false;
      return;
    }
  }

  // If rescale tool active -> start painting when clicking any block. Do this AFTER checking handles
  if(toolMode === 'rescale'){
    const intersects = raycaster.intersectObjects(blocksGroup.children, false);
    if(intersects.length){
      // clicking a block while in rescale mode should select that block (so user can switch selection)
      const hitObj = intersects[0].object;
      // restore previous selection's visual state
      if(selectedMesh && selectedMesh !== hitObj){
        if(selectedMesh.material && selectedMesh.userData && selectedMesh.userData._origEmissive){
          // restore previous emissive if stored
          try { selectedMesh.material.emissive.copy(selectedMesh.userData._origEmissive); } catch(e){}
          delete selectedMesh.userData._origEmissive;
        }
      }
      // set new selection
      selectedMesh = hitObj;
      // subtly highlight selection (non-destructive)
      if(selectedMesh && selectedMesh.material && !selectedMesh.userData._origEmissive){
        try { selectedMesh.userData._origEmissive = selectedMesh.material.emissive.clone(); } catch(e){}
      }
      if(selectedMesh && selectedMesh.material && selectedMesh.material.emissive){
        try { selectedMesh.material.emissive.copy(new THREE.Color(0x3399ff).multiplyScalar(0.18)); } catch(e){}
      }
      // update size input if available
      const ud = selectedMesh.userData;
      if(ud && ud.S){
        const sizeEl = document.getElementById("size");
        if(sizeEl) sizeEl.value = Math.round(ud.S[0]);
      }

      // start painting on the clicked block
      isPainting = true;
      paintedMap.clear();
      createPaintMarkerAt(hitObj);
      // keep dragging painting active
      // NOTE: do NOT return here — allow placement behavior to proceed if user clicked empty space or ground/top later
      return;
    } else {
      // If clicked empty space while rescale tool is active, do NOT block placement — allow normal placement logic below.
      // (previously returned here which prevented placement while rescale was active)
      // fall through to placement handling
    }
  }

  // existing grow handle / placement logic follows when not in rescale tool
  const intersects = raycaster.intersectObjects(blocksGroup.children.concat([ground]), false);
  if(intersects.length){
    const i = intersects[0];
    if(i.object === ground){
      // if placement mode is OFF, do not place new blocks on ground
      if(!placeMode) return;

      const hit = i.point;
      // allow exact integer sizes (>=1) from the size input
      const raw = parseFloat(document.getElementById("size").value) || 1;
      const s = Math.max(1, Math.round(raw));
      // snap to this block's own grid (use size s as unit)
      const px = snap(hit.x, s);
      const pz = snap(hit.z, s);
      const py = 0;

      const mat = getSelectedMaterial();
      const colorOverride = getCurrentColorOverride();
      
      let materialOrColor = mat;
      let matName = selectedMaterialName;

      if (!materialOrColor) {
        materialOrColor = colorOverride || [0.95, 0.95, 0.95]; // Use color override or default white
        matName = null;
      }

      placeBlockAt(px, snap(py, s), pz, s, s, s, materialOrColor, matName);
      
    }else{
      // clicking on an existing block:
      // If destroy tool is active -> delete immediately on left-click
      if(toolMode === 'destroy'){
        try{
          const meshToDelete = i.object;
          if(selectedMesh === meshToDelete) selectedMesh = null;
          removeGrowHandles();
          blocksGroup.remove(meshToDelete);
          if(meshToDelete.geometry) meshToDelete.geometry.dispose();
          if(meshToDelete.material) try{ meshToDelete.material.dispose && meshToDelete.material.dispose(); }catch(e){}
          // clear any lingering paint markers so blue dots don't remain
          try{ clearPaintMarkers(); }catch(e){}
          updateJSON();
          const evt = new CustomEvent('block:deleted', { detail: { } });
          window.dispatchEvent(evt);
        }catch(e){}
        return;
      }
      // If clicking a block's top surface, allow placing a block on top.
      const hitObj = i.object;
      const topY = hitObj.position.y + ((hitObj.userData && hitObj.userData.S) ? hitObj.userData.S[1]/2 : GRID_UNIT/2);
      const faceNormalWorld = i.face ? i.face.normal.clone().transformDirection(hitObj.matrixWorld) : null;
      const clickedTop = faceNormalWorld ? (faceNormalWorld.y > 0.9) : false;

      if(clickedTop){
        // if placement mode is OFF, do not place new blocks on top
        if(!placeMode) return;

        // place block on top of this block
        const hit = i.point;
        const raw = parseFloat(document.getElementById("size").value) || 1;
        const s = Math.max(1, Math.round(raw));
        // snap using this block's grid unit
        const px = snap(hit.x, s);
        const pz = snap(hit.z, s);
        const pyTop = Math.round(topY); // top surface world Y

        // COMPENSATE for editor's internal +1 offset: pass baseY = topSurfaceY - 1
        const basePy = pyTop - 1;

        const mat = getSelectedMaterial();
        const colorOverride = getCurrentColorOverride();
        
        let materialOrColor = mat;
        let matName = selectedMaterialName;

        if (!materialOrColor) {
          materialOrColor = colorOverride || [0.95, 0.95, 0.95]; // Use color override or default white
          matName = null;
        }

        placeBlockAt(px, snap(basePy, s), pz, s, s, s, materialOrColor, matName);
        
        return;
      }

      // NEW: if user clicked a side face (not the top), place a block adjacent to that face
      // Prevent diagonal placement by only treating the hit as a side-face if the world normal
      // is strongly aligned to one primary axis (dominant component).
      const isSideFace = (function(){
        if(!faceNormalWorld) return false;
        // normalize to be safe
        const n = faceNormalWorld.clone().normalize();
        const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
        // REJECT nearly-vertical hits aggressively to avoid edge/corner ambiguity
        if(ay > 0.4) return false;
        // require very strong dominance to avoid diagonal cases (tighten threshold)
        const dominant = Math.max(ax, az);
        if(dominant < 0.995) return false;
        // ensure the non-dominant horizontal component is very small to avoid diagonal cases
        if(ax > az){
          return ax > 0.995 && az < 0.08;
        } else {
          return az > 0.995 && ax < 0.08;
        }
      })();

      if(isSideFace){
        // if placement mode is OFF, do not place adjacent blocks
        if(!placeMode) return;

        const hitPoint = i.point.clone();
        const raw = parseFloat(document.getElementById("size").value) || 1;
        const s = Math.max(1, Math.round(raw));

        // direction in world space pointing outward from the face
        // snap direction to the primary axis to avoid diagonal offsets
        let dir = faceNormalWorld.clone().normalize();
        // choose dominant axis and snap dir to exact axis-aligned vector
        if(Math.abs(dir.x) > Math.abs(dir.z)){
          dir.set(Math.sign(dir.x), 0, 0);
        } else {
          dir.set(0, 0, Math.sign(dir.z));
        }

        // compute new block center by offsetting half size along face normal
        const center = hitPoint.clone().add(dir.clone().multiplyScalar(s / 2));

        // snap to grid in whole GRID_UNIT steps to avoid half-unit offsets
        const px = snap(center.x, s);
        const pz = snap(center.z, s);
        const pyCenter = Math.round(center.y);
        const basePyCandidate = Math.round(pyCenter - (s / 2));

        // COMPENSATE for editor's internal +1 offset: subtract 1 from baseY
        const basePy = basePyCandidate - 1;

        // Helper: check for cardinal (non-diagonal) neighbor blocks at the target base cell
        function hasCardinalNeighborAt(x, baseY, z){
          // convert target base cell into expected center coordinates for comparison
          // centerY = baseY + halfHeight + 1 (editor stores centers with +1 offset applied on placement)
          const half = Math.round(s) / 2;
          const targetCenterY = baseY + 1 + half;
          // check the four cardinal offsets (±GRID_UNIT in x or z)
          const offsets = [
            {dx: GRID_UNIT, dz: 0},
            {dx: -GRID_UNIT, dz: 0},
            {dx: 0, dz: GRID_UNIT},
            {dx: 0, dz: -GRID_UNIT}
          ];
          for(const off of offsets){
            const tx = Math.round(x + off.dx);
            const tz = Math.round(z + off.dz);
            // iterate blocks to see if any block has center matching tx,tz and shares the same baseY
            for(const b of blocksGroup.children){
              const ud = b.userData || {};
              if(!ud.P || !ud.S) continue;
              const bx = Math.round(ud.P[0]);
              const bz = Math.round(ud.P[2]);
              const bHalf = (ud.S && ud.S[1]) ? ud.S[1] / 2 : (GRID_UNIT/2);
              const bBaseY = Math.round(ud.P[1] - bHalf);
              // compare coordinates (allow exact grid-aligned equality)
              if(bx === tx && bz === tz && bBaseY === baseY){
                return true;
              }
            }
          }
          return false;
        }

        // Only allow placement when at least one cardinal neighbor exists (reject diagonal-only adjacency)
        if(!hasCardinalNeighborAt(px, basePy, pz)){
          return;
        }

        const mat = getSelectedMaterial();
        const colorOverride = getCurrentColorOverride();
        
        let materialOrColor = mat;
        let matName = selectedMaterialName;

        if (!materialOrColor) {
          materialOrColor = colorOverride || [0.95, 0.95, 0.95];
          matName = null;
        }

        placeBlockAt(px, snap(basePy, s), pz, s, s, s, materialOrColor, matName);
        return;
      }

      // Selection logic: first click selects but does NOT create grow handles; second click on same mesh creates them

      // --- UPDATED: use safe highlight/unhighlight helpers so selecting doesn't permanently darken meshes ---
      function highlightMesh(mesh){
        if(!mesh || !mesh.material) return;
        // store original emissive (clone) only once
        if(mesh.material.emissive && !mesh.userData._origEmissive){
          mesh.userData._origEmissive = mesh.material.emissive.clone();
        }
        if(mesh.material.emissive){
          // subtle bluish highlight that is not too dark
          mesh.material.emissive.copy(new THREE.Color(0x3399ff).multiplyScalar(0.18));
        }
      }
      function unhighlightMesh(mesh){
        if(!mesh || !mesh.material) return;
        if(mesh.material.emissive && mesh.userData && mesh.userData._origEmissive){
          mesh.material.emissive.copy(mesh.userData._origEmissive);
          delete mesh.userData._origEmissive;
        }
      }
      // --- end helpers ---

      if(selectedMesh === hitObj){
        // second click on same mesh -> show grow handles (toggle)
        // keep highlight behavior temporary (do not permanently change emissive)
        highlightMesh(selectedMesh);
        // only create grow handles if rescale tool is active
        if(toolMode === 'rescale') createGrowHandlesFor(selectedMesh);
        // Immediately try to begin a grow drag if the click hit a handle position:
        // raycast against newly-created handles using the same raycaster / pointer.
        const handleIntersectsAfter = (toolMode === 'rescale') ? raycaster.intersectObjects(growHandlesGroup.children, false) : [];
        if(handleIntersectsAfter.length){
          const hHit = handleIntersectsAfter[0];
          const h = hHit.object;
          const ud = h.userData && h.userData.handle;
          if(ud && selectedMesh){
            isDraggingGrow = true;
            const axisVec = new THREE.Vector3(ud.axis==='x'?1:0, ud.axis==='y'?1:0, ud.axis==='z'?1:0);
            const startPoint = hHit.point.clone();
            activeGrow = {
              axis: ud.axis,
              dir: ud.dir,
              startPoint: startPoint,
              mesh: selectedMesh,
              axisVec: axisVec,
              startCenter: selectedMesh.position.clone()
            };
            controls.enableRotate = false;
            controls.enablePan = false;
            return;
          }
        }
        return;
      }

      // selecting a different mesh: restore previous selection emissive and highlight new one
      if(selectedMesh) unhighlightMesh(selectedMesh);
      selectedMesh = hitObj;
      highlightMesh(selectedMesh);
      const ud = selectedMesh.userData;
      if(ud && ud.P && ud.S){
        // update only size in UI (position inputs removed)
        const sizeEl = document.getElementById("size");
        if(sizeEl) sizeEl.value = Math.round(ud.S[0]);
      }
      // ensure handles are not created yet (user must click again to create them)
      removeGrowHandles();
    }
  }
}

function onPointerMove(ev){
  // If rescale tool active and painting, raycast to blocks and add paint markers
  if(toolMode === 'rescale' && isPainting){
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(blocksGroup.children, false);
    if(intersects.length){
      const hit = intersects[0].object;
      createPaintMarkerAt(hit);
    }
    return;
  }

  if(!isDraggingGrow || !activeGrow) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const planeIntersects = raycaster.intersectObject(ground, false);
  let point;
  if(planeIntersects.length) point = planeIntersects[0].point;
  else point = raycaster.ray.at(10, new THREE.Vector3());
  const deltaVec = new THREE.Vector3().subVectors(point, activeGrow.startCenter);
  const axisVec = activeGrow.axisVec.clone().multiplyScalar(activeGrow.dir);
  const signed = deltaVec.dot(axisVec);
  const steps = Math.max(0, Math.round(signed / GRID_UNIT));
  while(previewGroup.children.length) {
    const c = previewGroup.children[0];
    previewGroup.remove(c);
    if(c.geometry) c.geometry.dispose();
    if(c.material) c.material.dispose && c.material.dispose();
  }
  for(let i=1;i<=steps;i++){
    const pos = activeGrow.startCenter.clone().add(axisVec.clone().multiplyScalar(i * GRID_UNIT));
    const geom = new THREE.BoxGeometry(activeGrow.mesh.userData.S[0], activeGrow.mesh.userData.S[1], activeGrow.mesh.userData.S[2]);
    const pm = PREVIEW_MAT.clone();
    const box = new THREE.Mesh(geom, pm);
    box.position.copy(pos);
    previewGroup.add(box);
  }
}

function onPointerUp(ev){
  // if painting with rescale tool, finalize (currently painting just leaves blue markers; we stop painting)
  if(toolMode === 'rescale' && isPainting){
    isPainting = false;
    // keep markers visible (they were added to the scene). If desired to clear after, call clearPaintMarkers().
    return;
  }

  if(isDraggingGrow && activeGrow){
    const count = previewGroup.children.length;
    if(count > 0){
      const axisVec = activeGrow.axisVec.clone().multiplyScalar(activeGrow.dir);
      const s = activeGrow.mesh.userData.S[0];
      
      // Use the material/color properties of the original block being grown
      const originalMatName = activeGrow.mesh.userData.M;
      
      let materialOrColor;
      const matName = originalMatName;
      
      if(originalMatName && materials[originalMatName]){
          materialOrColor = materials[originalMatName].material;
      } else {
          materialOrColor = activeGrow.mesh.userData.C || [0.95,0.95,0.95];
      }
      
      // Temporarily set currentColorOverride to the block's color tint (if texture)
      // or to the solid color (if solid color) so placeBlockAt uses it.
      const originalOverride = currentColorOverride;
      
      if(activeGrow.mesh.userData.C) {
          setCurrentColorOverride(activeGrow.mesh.userData.C);
      } else if (activeGrow.mesh.userData.M) {
          // If texture but no color tint was explicitly saved (e.g., default texture color), ensure no override.
          setCurrentColorOverride(null);
      }
      
      for(let i=1;i<=count;i++){
        const pos = activeGrow.startCenter.clone().add(axisVec.clone().multiplyScalar(i * GRID_UNIT));
        // Snap horizontal positions to GRID_UNIT to align with grid baseline
        const baseX = snap(pos.x, GRID_UNIT);
        const baseZ = snap(pos.z, GRID_UNIT);
        // Compute base Y (ground/base) from center and snap to GRID_UNIT as well.
        // Use center.y - halfHeight to obtain base, then snap so final placement aligns to grid baseline.
        const baseY = snap(Math.round(pos.y - activeGrow.mesh.userData.S[1]/2), GRID_UNIT);
        
        // Pass materialOrColor and matName explicitly. 
        placeBlockAt(baseX, baseY, baseZ, s, s, s, materialOrColor, matName);
      }

      // Restore global color override state
      setCurrentColorOverride(originalOverride);

    }
    while(previewGroup.children.length) {
      const c = previewGroup.children[0];
      previewGroup.remove(c);
      if(c.geometry) c.geometry.dispose();
      if(c.material) c.material.dispose && c.material.dispose();
    }
    isDraggingGrow = false;
    activeGrow = null;
    controls.enableRotate = true;
    controls.enablePan = true;
  }
}

// Attach pointer listeners (single set)
renderer.domElement.addEventListener("pointerdown", onPointerDown);
renderer.domElement.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);

// NEW: right-click on canvas deletes block under cursor
function onContextMenu(ev){
  ev.preventDefault();
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(blocksGroup.children, false);
  if(intersects.length){
    const hit = intersects[0];
    const mesh = hit.object;
    try{
      // remove selected mesh if it's the one being deleted
      if(selectedMesh === mesh) selectedMesh = null;
      // remove grow handles if they reference this mesh
      removeGrowHandles();
      blocksGroup.remove(mesh);
      if(mesh.geometry) mesh.geometry.dispose();
      if(mesh.material) try{ mesh.material.dispose && mesh.material.dispose(); }catch(e){}
      // ensure paint markers are cleared (fix for lingering blue dot)
      try{ clearPaintMarkers(); }catch(e){}
      updateJSON();
      const evt = new CustomEvent('block:deleted', { detail: { } });
      window.dispatchEvent(evt);
    }catch(e){}
  } else {
    // nothing under cursor: do nothing (no floating menu)
  }
}
renderer.domElement.addEventListener('contextmenu', onContextMenu);

// NEW: double-click -> notify UI for contextual menu
// (removed - replaced by right-click contextmenu behavior so double-click no longer opens menu)

// renderer.domElement.addEventListener('dblclick', onDoubleClick);
// (onDoubleClick function removed)

// --- NEW: keyboard shortcut to delete currently selected block ---
window.addEventListener('keydown', (ev) => {
  // Only respond to Delete or Backspace
  if(ev.key !== 'Delete' && ev.key !== 'Backspace') return;
  if(!selectedMesh) return;

  // remove selected mesh from scene and dispose resources
  try {
    // remove grow handles if they reference this mesh
    removeGrowHandles();
    // remove from group
    blocksGroup.remove(selectedMesh);
    if(selectedMesh.geometry) selectedMesh.geometry.dispose();
    if(selectedMesh.material) {
      try { selectedMesh.material.dispose && selectedMesh.material.dispose(); } catch(e){ }
    }
    // clear selection
    selectedMesh = null;
    // clear any paint markers so UI stays clean
    try{ clearPaintMarkers(); }catch(e){}
    // update JSON and notify UI
    updateJSON();
    const evt = new CustomEvent('block:deleted', { detail: { } });
    window.dispatchEvent(evt);
  } catch(e){}
});
// --- end keyboard delete handler ---

// Animation loop
function animate(){
  requestAnimationFrame(animate);
  controls.update();

  // Update placement animations for newly placed meshes
  const now = performance.now();
  for(const mesh of blocksGroup.children){
    const anim = mesh.userData && mesh.userData._placeAnim;
    if(anim){
      const t = Math.min(1, (now - anim.startTime) / Math.max(1, anim.duration));
      // easeOutCubic for a pleasant settling feel
      const ease = 1 - Math.pow(1 - t, 3);
      const curScale = anim.fromScale + (anim.toScale - anim.fromScale) * ease;
      mesh.scale.set(curScale, curScale, curScale);
      const yOffset = anim.fromYOffset + (anim.toYOffset - anim.fromYOffset) * ease;
      // Use stored center Y directly so there is no extra half-size offset that can make blocks float
      const baseCenterY = (mesh.userData && mesh.userData.P) ? mesh.userData.P[1] : mesh.position.y;
      mesh.position.y = baseCenterY + yOffset;

      if(t >= 1){
        // cleanup animation meta and ensure exact final values
        delete mesh.userData._placeAnim;
        mesh.scale.set(1,1,1);
        if(mesh.userData && mesh.userData.P){
          // ensure final center Y is exact stored center
          mesh.position.y = mesh.userData.P[1];
        }
      }
    }
  }

  // --- Clouds animation: drift all cloud clusters slowly along their direction vector ---
  try{
    const dt = Math.max(8, Math.min(32, (now - (animate._lastNow || (now - 16.6667)))));
    animate._lastNow = now;
    for(const cluster of cloudGroup.children){
      const d = cluster.userData.direction || new THREE.Vector3(1,0,0);
      const mult = cluster.userData.speedMultiplier || 1.0;
      // move along direction scaled by CLOUD_SPEED and cluster multiplier, times actual frame delta
      const move = d.clone().multiplyScalar(CLOUD_SPEED * mult * dt);
      cluster.position.add(move);
      // compute approximate world center position for distance calculations
      const worldX = (cluster.userData.baseX || 0) + cluster.position.x + (cluster.userData.offset || 0);
      const worldZ = (cluster.userData.baseZ || 0) + cluster.position.z;
      const clusterWorldPos = new THREE.Vector3(worldX, CLOUD_Y, worldZ);
      const camDist = camera.position.distanceTo(clusterWorldPos);

      // Fade-in/out control:
      // When cluster is newer or relatively close to camera, fade in to near-opaque; when far beyond radius, fade out.
      const lifeAge = now - (cluster.userData.birthTime || now);
      const fadeIn = Math.min(1, lifeAge / (cluster.userData.fadeInMs || 2000));
      // distance-based fade: begin fade-out past a threshold (~1.2 * radius)
      const fadeOutStart = CLOUD_AREA_RADIUS * 1.2;
      const fadeOutEnd = CLOUD_AREA_RADIUS * 1.6;
      let distFade = 1.0;
      if(camDist > fadeOutStart){
        distFade = 1 - Math.min(1, (camDist - fadeOutStart) / Math.max(1, (fadeOutEnd - fadeOutStart)));
      }
      // overall target opacity
      const targetOpacity = Math.max(0, Math.min(0.98, fadeIn * distFade));

      // apply eased opacity to all children (meshes) of cluster
      const ease = (t) => t<0?0:(t>1?1:(t*t*(3-2*t))); // smoothstep-like
      const applied = ease(targetOpacity);
      for(const piece of cluster.children){
        if(piece && piece.material){
          piece.material.opacity = applied;
        }
      }

      // loop cluster when far beyond radius to create continuous flow (but fade-out allows seamless entry/exit)
      const centerDist = Math.sqrt(worldX * worldX + worldZ * worldZ);
      if(centerDist > CLOUD_AREA_RADIUS * 1.8){
        // teleport to opposite side and reset birthTime so it fades in naturally
        cluster.position.x = - (cluster.userData.baseX || 0) * 0.98 - (cluster.userData.offset || 0) + (Math.random() - 0.5) * 24;
        cluster.position.z = - (cluster.userData.baseZ || 0) * 0.98 + (Math.random() - 0.5) * 24;
        cluster.userData.birthTime = now - Math.random()*400; // slight stagger so not all clusters fade together
      }
    }
  }catch(e){}

  if(selectedMesh && !isDraggingGrow){
    // Only show grow handles visually when rescale tool is active
    if(toolMode === 'rescale'){
      if(growHandlesGroup.children.length === 0){
        createGrowHandlesFor(selectedMesh);
      } else {
        const s = selectedMesh.userData.S ? selectedMesh.userData.S[0] : GRID_UNIT;
        const half = s/2;
        const center = selectedMesh.position.clone();
        const poss = [
          new THREE.Vector3(center.x + half + GROW_SPHERE_RADIUS, center.y, center.z),
          new THREE.Vector3(center.x - half - GROW_SPHERE_RADIUS, center.y, center.z),
          new THREE.Vector3(center.x, center.y + half + GROW_SPHERE_RADIUS, center.z),
          new THREE.Vector3(center.x, center.y - half - GROW_SPHERE_RADIUS, center.z),
          new THREE.Vector3(center.x, center.y, center.z + half + GROW_SPHERE_RADIUS),
          new THREE.Vector3(center.x, center.y, center.z - half - GROW_SPHERE_RADIUS)
        ];
        for(let i=0;i<growHandlesGroup.children.length;i++){
          // fallback: compute positions based on selectedMesh fresh each frame to avoid drift
          const halfSize = selectedMesh.userData.S ? selectedMesh.userData.S[0]/2 : GRID_UNIT/2;
          const centerPos = selectedMesh.position.clone();
          const positions = [
            new THREE.Vector3(centerPos.x + halfSize + GROW_SPHERE_RADIUS, centerPos.y, centerPos.z),
            new THREE.Vector3(centerPos.x - halfSize - GROW_SPHERE_RADIUS, centerPos.y, centerPos.z),
            new THREE.Vector3(centerPos.x, centerPos.y + halfSize + GROW_SPHERE_RADIUS, centerPos.z),
            new THREE.Vector3(centerPos.x, centerPos.y - halfSize - GROW_SPHERE_RADIUS, centerPos.z),
            new THREE.Vector3(centerPos.x, centerPos.y, centerPos.z + halfSize + GROW_SPHERE_RADIUS),
            new THREE.Vector3(centerPos.x, centerPos.y, centerPos.z - halfSize - GROW_SPHERE_RADIUS)
          ];
          if(growHandlesGroup.children[i] && positions[i]){
            growHandlesGroup.children[i].position.copy(positions[i]);
          }
        }
      }
    } else {
      // ensure handles are removed when not in rescale mode
      if(growHandlesGroup.children.length) removeGrowHandles();
    }
  }
  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", ()=>{
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Theme & animated background helpers (kept simple, UI triggers applyTheme via wireUI)
export function updateSceneTheme(isLight){
  const cssBg = getComputedStyle(document.body).getPropertyValue('--bg').trim() || (isLight ? '#f6f6f6' : '#111111');
  const targetBg = cssBg;
  function getCurrentBackgroundHex(){
    try{
      if(scene && scene.background && scene.background.isColor){
        return '#'+scene.background.getHexString().toUpperCase();
      }
      if(renderer && typeof renderer.getClearColor === 'function'){
        const c = renderer.getClearColor(new THREE.Color());
        if(c && c.isColor) return '#'+c.getHexString().toUpperCase();
      }
    }catch(e){}
    return isLight ? '#f6f6f6' : '#111111';
  }
  const currentHex = getCurrentBackgroundHex();
  // quick immediate set (no full animation helper here to keep file focused)
  const target = new THREE.Color(targetBg);
  renderer.setClearColor(target, 1);
  scene.background = target.clone();

  // Dark mode adjustments: black floor and white grid for strong contrast
  if(!isLight){
    try{
      if(ground && ground.material) {
        ground.material.color.set(0x000000);
        ground.material.emissive.set(0x000000);
      }
      if(grid && grid.material && grid.material.color){
        // Always keep grid color white regardless of theme
        grid.material.color.set('#ffffff');
        grid.visible = true;
        grid.material.transparent = false;
        grid.material.opacity = 1.0;
      }
    }catch(e){}
  } else {
    // Light mode: slightly off-white floor and more subtle grid
    try{
      if(ground && ground.material){
        ground.material.color.set(0xFBFDFF);
        ground.material.emissive.set(0xFFFFFF);
        ground.material.emissiveIntensity = 0.06;
      }
      // Ensure grid color remains white in light mode as well, but respect visibility mode
      try {
        if(grid && grid.material && grid.material.color){
          // Force grid color to white in light mode as well
          grid.material.color.set('#ffffff');
        }
        if(typeof setGridMode === 'function') {
          setGridMode(currentGridMode || 'normal');
        } else if(grid && grid.material && grid.material.color){
          grid.material.color.set('#ffffff');
          grid.visible = false;
        }
      } catch(e){}
    }catch(e){}
  }

  try{ 
    // Always keep grid color white for consistent look; UI still controls visibility via setGridMode
    if(grid && grid.material && grid.material.color){
      // leave as-set by above mode logic (white)
      grid.material.color.set('#ffffff');
    }
  }catch(e){}
}

// New: grid display mode helper
let currentGridMode = 'hidden'; // 'normal' | 'translucent' | 'hidden'
export function setGridMode(mode){
  if(!grid) return;
  currentGridMode = mode;
  if(mode === 'hidden'){
    grid.visible = false;
  } else if(mode === 'translucent'){
    grid.visible = true;
    try{
      if(grid.material){
        grid.material.transparent = true;
        grid.material.opacity = 0.35;
      }
    }catch(e){}
  } else { // normal
    grid.visible = true;
    try{
      if(grid.material){
        grid.material.transparent = false;
        grid.material.opacity = 1.0;
      }
    }catch(e){}
  }
}

// Export a start function that also wires UI (ui module will call back into exported functions)
export function startEditor(){
  // wire UI (ui module will call functions exported from this module)
  wireUI({
    placeBlockAt, placeBlock: placeBlockAt, updateJSON,
    snap, hexToRgbNormalized, rgbToHex,
    blocksGroup, selectedMeshRef: () => selectedMesh, setSelected: (m)=>{ selectedMesh = m; },
    createGrowHandlesFor, removeGrowHandles, updateHandlesPosition, updateSceneTheme,
    // expose materials API to UI
    materials, getSelectedMaterial, setSelectedMaterial,
    // color override API
    setCurrentColorOverride, getCurrentColorOverride,
    // grid mode
    setGridMode,
    // expose setToolMode to wireUI via startEditor export mapping (already done in startEditor)
    setToolMode,
    // NEW: place mode API
    setPlaceMode, placeMode,
    // NEW: transparency API
    setBlockTransparency
  });
}

// Tombstone markers for removed parts from original monolithic app.js:
// removed function oldLargeInit() {}
// removed duplicate event listener blocks that were present twice in original file

// add a small hook variable for UI to set/get selected material name
export let selectedMaterialName = null;
export function getSelectedMaterial(){
  return selectedMaterialName ? (materials[selectedMaterialName] ? materials[selectedMaterialName].material : null) : null;
}
export function setSelectedMaterial(name){
  selectedMaterialName = name && materials[name] ? name : null;
}

// NEW: set transparency on a given mesh (value in 0..1). If null, clears transparency flag.
export function setBlockTransparency(mesh, value){
  if(!mesh || !mesh.material) return;
  const v = (typeof value === 'number') ? Math.max(0, Math.min(1, value)) : null;
  try{
    // clone material to avoid shared material side-effects
    const newMat = mesh.material.clone ? mesh.material.clone() : mesh.material;
    if(v === null){
      // clear transparency -> fully opaque
      newMat.transparent = false;
      newMat.opacity = 1.0;
      if(mesh.userData) delete mesh.userData.T;
    } else {
      newMat.transparent = v < 1.0;
      newMat.opacity = v;
      if(mesh.userData) mesh.userData.T = Math.round(v * 1000) / 1000;
    }
    // apply material
    mesh.material = newMat;
    // ensure update to JSON export
    updateJSON();
  }catch(e){}
}