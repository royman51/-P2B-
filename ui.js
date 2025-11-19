// src/ui.js
// Wires DOM controls to editor functions. Keeps UI-specific behavior separate.

import * as THREE from "three";

export function wireUI(editor){
  // editor is an object with functions/refs exported from editor module
  const COLORS = [
    {name:'빨강', rgb:[1,0,0]},
    {name:'노랑', rgb:[1,1,0]},
    {name:'초록', rgb:[0,1,0]},
    {name:'청록', rgb:[0,1,1]},
    {name:'파랑', rgb:[0,0,1]},
    {name:'흰색', rgb:[1,1,1]},
    {name:'회색', rgb:[0.6,0.6,0.6]}
  ];

  // MATERIALS list derived from editor.materials keys
  const MATERIAL_NAMES = Object.keys(editor.materials || {});

  // Build material icons into #materialsList
  const matList = document.getElementById('materialsList');
  matList.innerHTML = '';
  let selectedMaterial = null;

  // Panels are opened only via the top toolbar buttons. Hide all panels initially.
  (function initPanelVisibility(){
    document.querySelectorAll('#panels .panel').forEach(p=> p.classList.add('hidden'));
  })();

  // Create a dedicated rescale instruction panel (hidden by default)
  (function ensureRescalePanel(){
    const panelsRoot = document.getElementById('panels');
    if(!panelsRoot) return;
    let resPanel = document.getElementById('rescalePanel');
    if(!resPanel){
      resPanel = document.createElement('section');
      resPanel.id = 'rescalePanel';
      resPanel.className = 'panel hidden';
      resPanel.dataset.area = 'rescale';
      const label = document.createElement('label');
      label.className = 'panelTitle';
      label.textContent = '리사이징 툴';
      resPanel.appendChild(label);
      const msg = document.createElement('div');
      msg.style.fontSize = '13px';
      msg.style.color = 'var(--muted)';
      msg.style.padding = '6px 2px';
      msg.textContent = '점을 당겨서 블록을 늘릴수있습니다.';
      resPanel.appendChild(msg);
      // insert at top so instruction is visible
      panelsRoot.insertBefore(resPanel, panelsRoot.firstChild);
    }
  })();
  // --- end tabs creation ---

  MATERIAL_NAMES.forEach(name=>{
    const wrapper = document.createElement('button');
    wrapper.type = 'button';
    wrapper.className = 'mat-icon';
    wrapper.dataset.name = name;

    const img = document.createElement('img');
    // find texture path (editor.materials[name].texture.image?.src may not be ready immediately),
    // use a best-effort src if available, otherwise a placeholder neutral square.
    const tex = editor.materials[name] && editor.materials[name].texture;
    img.src = (tex && tex.image && tex.image.src) ? tex.image.src : '/플라스틱 (2).png';
    img.alt = name;
    wrapper.appendChild(img);

    const label = document.createElement('div');
    label.style.fontSize = '12px';
    label.style.color = 'var(--muted)';
    label.textContent = name;
    wrapper.appendChild(label);

    wrapper.addEventListener('click', ()=>{
      // clear selection on all icon buttons
      document.querySelectorAll('.mat-icon').forEach(s=>s.classList.remove('selected'));
      wrapper.classList.add('selected');
      selectedMaterial = name;
      if(editor.setSelectedMaterial) editor.setSelectedMaterial(name);

      // If a block is currently selected, apply the chosen material to it immediately
      try{
        const sel = editor.selectedMeshRef && editor.selectedMeshRef();
        if(sel){
          // dispose old material safely
          if(sel.material){
            try{ sel.material.dispose && sel.material.dispose(); }catch(e){}
          }
          // If material has a texture/material defined use a clone of that material,
          // otherwise apply current color override as a simple MeshStandardMaterial.
          const matDef = editor.materials && editor.materials[name];
          if(matDef && matDef.material){
            sel.material = matDef.material.clone();
            // if there's a current color override, tint the cloned material
            const colOverride = editor.getCurrentColorOverride && editor.getCurrentColorOverride();
            if(colOverride && sel.material.color){
              sel.material.color.copy(new THREE.Color(colOverride[0], colOverride[1], colOverride[2]));
              try{ sel.material.emissive = new THREE.Color(colOverride[0], colOverride[1], colOverride[2]); sel.material.emissiveIntensity = 0.06; }catch(e){}
            }
            // store the material's emissive as the original emissive so highlight restore is accurate
            try { sel.userData._origEmissive = sel.material.emissive.clone(); } catch(e){}
            sel.userData.M = name;
            sel.userData.C = sel.userData.C && sel.userData.C.length ? sel.userData.C : null;
          } else {
            // No texture material -> use current color override (or default)
            const useCol = editor.getCurrentColorOverride ? editor.getCurrentColorOverride() : [0.95,0.95,0.95];
            sel.material = new THREE.MeshStandardMaterial({ color: new THREE.Color(useCol[0], useCol[1], useCol[2]), roughness:0.6 });
            try{ sel.material.emissive = new THREE.Color(useCol[0], useCol[1], useCol[2]); sel.material.emissiveIntensity = 0.06; }catch(e){}
            // store original emissive for later highlight restore
            try { sel.userData._origEmissive = sel.material.emissive.clone(); } catch(e){}
            sel.userData.M = null;
            sel.userData.C = useCol.slice(0,3).map(v=>Math.round(v*1000)/1000);
          }
          if(editor.updateJSON) editor.updateJSON();
        }
      }catch(e){}
    });

    matList.appendChild(wrapper);
  });

  // Theme wiring
  // theme toggle now lives in settings panel
  const themeBtn = document.getElementById('themeBtn');
  function applyTheme(isLight){
    if(isLight){
      document.body.classList.add('light');
      themeBtn.textContent = '다크';
      themeBtn.classList.add('darkLabel');
    }else{
      document.body.classList.remove('light');
      themeBtn.textContent = '라이트';
      themeBtn.classList.remove('darkLabel');
    }
    try{ localStorage.setItem('themeLight', isLight ? '1' : '0'); }catch(e){}
    if(editor.updateSceneTheme) editor.updateSceneTheme(isLight);
  }
  const stored = (function(){ try{ return localStorage.getItem('themeLight'); }catch(e){return null;} })();
  // Default to light mode when there's no stored preference
  applyTheme(stored === null || stored === '1');
  themeBtn && themeBtn.addEventListener('click', ()=> applyTheme(!document.body.classList.contains('light')));

  // Grid mode wiring (설정 panel radios)
  const gridRadios = Array.from(document.querySelectorAll('input[name="gridMode"]'));
  function setGridModeFromUI(mode){
    if(editor.setGridMode) editor.setGridMode(mode);
  }
  gridRadios.forEach(r=>{
    r.addEventListener('change', (e)=>{
      if(e.target.checked){
        setGridModeFromUI(e.target.value);
      }
    });
  });
  // initialize grid mode to normal
  setGridModeFromUI(document.querySelector('input[name="gridMode"]:checked')?.value || 'normal');

  // Colors
  const colorsEl = document.getElementById("colors");
  let selectedColorIdx = 5;
  let customColorHex = '#FFFFFF';
  let useCustom = false;

  COLORS.forEach((c,i)=>{
    const el = document.createElement("div");
    el.className = "color-swatch" + (i===selectedColorIdx ? " selected" : "");
    el.style.background = `rgb(${Math.round(c.rgb[0]*255)},${Math.round(c.rgb[1]*255)},${Math.round(c.rgb[2]*255)})`;
    el.title = c.name;
    el.addEventListener("click", ()=> {
      document.querySelectorAll(".color-swatch").forEach(s=>s.classList.remove("selected"));
      el.classList.add("selected");
      selectedColorIdx = i;
      useCustom = false;
      document.getElementById('customHex').value = editor.rgbToHex(c.rgb);
      document.getElementById('customColor').value = editor.rgbToHex(c.rgb);
      if(editor.setCurrentColorOverride) editor.setCurrentColorOverride(c.rgb);

      // If a block is selected, apply this color to it immediately
      try{
        const sel = editor.selectedMeshRef && editor.selectedMeshRef();
        if(sel){
          if(sel.material){
            try{ sel.material.dispose && sel.material.dispose(); }catch(e){}
          }
          const col = new THREE.Color(c.rgb[0], c.rgb[1], c.rgb[2]);
          sel.material = new THREE.MeshStandardMaterial({ color: col.clone(), roughness:0.6, metalness:0.0 });
          try{ sel.material.emissive = col.clone(); sel.material.emissiveIntensity = 0.06; }catch(e){}
          // store original emissive so deselect/restore doesn't leave a faded look
          try { sel.userData._origEmissive = sel.material.emissive.clone(); } catch(e){}
          sel.userData.C = c.rgb.slice(0,3).map(v=>Math.round(v*1000)/1000);
          sel.userData.M = null;
          if(editor.updateJSON) editor.updateJSON();
        }
      }catch(e){}
    });
    colorsEl.appendChild(el);
  });

  // --- NEW: Paint panel block size picker (1 / 3 / 5) ---
  (function addPaintSizePicker(){
    const sizeRow = document.createElement('div');
    sizeRow.style.display = 'flex';
    sizeRow.style.gap = '8px';
    sizeRow.style.marginTop = '8px';
    sizeRow.style.justifyContent = 'center';
    const sizes = [1,3,5];
    sizes.forEach(sz=>{
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'smallBtn';
      btn.style.padding = '8px 12px';
      btn.textContent = sz.toString();
      btn.title = `블록 크기 ${sz} (${sz},${sz},${sz})`;
      btn.addEventListener('click', ()=>{
        const sizeEl = document.getElementById('size');
        if(sizeEl){
          // set exact requested size (1,3,5) — editor placement will now accept integer sizes >= 1
          sizeEl.value = Math.round(sz);
          // trigger change so UI normalizes value
          sizeEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      sizeRow.appendChild(btn);
    });
    // add a small label above buttons
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.alignItems = 'center';
    const label = document.createElement('div');
    label.style.fontSize = '13px';
    label.style.color = 'var(--muted)';
    label.style.marginTop = '10px';
    label.textContent = '블록 크기 선택';
    wrapper.appendChild(label);
    wrapper.appendChild(sizeRow);
    // append to colors panel area
    colorsEl.parentNode && colorsEl.parentNode.appendChild(wrapper);
  })();
  // --- end size picker ---
  
  const customColorInput = document.getElementById('customColor');
  const customHexInput = document.getElementById('customHex');
  const useCustomBtn = document.getElementById('useCustomBtn');

  // initialize custom color input to default white
  customColorInput.value = customColorHex;
  customHexInput.value = customColorHex;

  customColorInput.addEventListener('input', (e)=>{
    customColorHex = e.target.value.toUpperCase();
    customHexInput.value = customColorHex;
  });
  customHexInput.addEventListener('change', (e)=>{
    let v = e.target.value.trim();
    if(!v.startsWith('#')) v = '#'+v;
    if(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(v)){
      customColorHex = v.toUpperCase();
      customColorInput.value = customColorHex;
    }else{
      e.target.value = customColorHex;
    }
  });

  useCustomBtn.addEventListener('click', ()=>{
    useCustom = true;
    selectedColorIdx = -1;
    document.querySelectorAll(".color-swatch").forEach(s=>s.classList.remove("selected"));
    customColorHex = customHexInput.value.toUpperCase();
    if(!customColorHex.startsWith('#')) customColorHex = '#'+customColorHex;
    customColorInput.value = customColorHex;
    const hex = customColorHex.replace('#','');
    const rgb = hex.length===3
      ? [parseInt(hex[0]+hex[0],16)/255, parseInt(hex[1]+hex[1],16)/255, parseInt(hex[2]+hex[2],16)/255]
      : [parseInt(hex.substring(0,2),16)/255, parseInt(hex.substring(2,4),16)/255, parseInt(hex.substring(4,6),16)/255];
    if(editor.setCurrentColorOverride) editor.setCurrentColorOverride(rgb);

    // If a block is selected, apply this custom color immediately
    try{
      const sel = editor.selectedMeshRef && editor.selectedMeshRef();
      if(sel){
        if(sel.material){
          try{ sel.material.dispose && sel.material.dispose(); }catch(e){}
        }
        const col = new THREE.Color(rgb[0], rgb[1], rgb[2]);
        sel.material = new THREE.MeshStandardMaterial({ color: col.clone(), roughness:0.6, metalness:0.0 });
        try{ sel.material.emissive = col.clone(); sel.material.emissiveIntensity = 0.06; }catch(e){}
        // store original emissive so highlight restore works correctly
        try { sel.userData._origEmissive = sel.material.emissive.clone(); } catch(e){}
        sel.userData.C = rgb.slice(0,3).map(v=>Math.round(v*1000)/1000);
        sel.userData.M = null;
        if(editor.updateJSON) editor.updateJSON();
      }
    }catch(e){}
  });

  // size, remove, clear, copy JSON
  const sizeInput = document.getElementById("size");
  const removeBtn = document.getElementById("removeBtn");
  const clearBtn = document.getElementById("clearBtn");
  const jsonOut = document.getElementById("jsonOut");
  const copyBtn = document.getElementById("copyBtn");
  const applyJsonBtn = document.getElementById("applyJsonBtn");

  // Make json textarea editable by user and initialize with current JSON
  jsonOut.readOnly = false;
  jsonOut.value = editor.updateJSON ? (function(){ editor.updateJSON(); return document.getElementById("jsonOut").value; })() : jsonOut.value;

  removeBtn.addEventListener("click", ()=>{
    const sel = editor.selectedMeshRef();
    if(sel){
      editor.blocksGroup.remove(sel);
      sel.geometry.dispose();
      if(sel.material) sel.material.dispose();
      editor.setSelected(null);
      editor.removeGrowHandles();
      editor.updateJSON();
    }
  });
  clearBtn.addEventListener("click", ()=>{
    while(editor.blocksGroup.children.length) {
      const c = editor.blocksGroup.children[0];
      editor.blocksGroup.remove(c);
      c.geometry.dispose();
      if(c.material) c.material.dispose();
    }
    editor.setSelected(null);
    editor.removeGrowHandles();
    editor.updateJSON();
    // refresh editable JSON area
    jsonOut.value = document.getElementById("jsonOut").value;
  });

  copyBtn.addEventListener("click", async ()=>{
    try{
      await navigator.clipboard.writeText(jsonOut.value);
      copyBtn.textContent = "복사됨!";
      setTimeout(()=>copyBtn.textContent="JSON 복사",900);
    }catch(e){}
  });

  // Apply user-edited JSON into scene
  applyJsonBtn.addEventListener("click", ()=>{
    let parsed;
    try{
      parsed = JSON.parse(jsonOut.value);
      if(!Array.isArray(parsed)) throw new Error("JSON should be an array of block objects.");
    }catch(e){
      applyJsonBtn.textContent = "파싱 오류";
      setTimeout(()=>applyJsonBtn.textContent="JSON 적용",1000);
      return;
    }

    // Clear existing blocks
    while(editor.blocksGroup.children.length) {
      const c = editor.blocksGroup.children[0];
      editor.blocksGroup.remove(c);
      c.geometry.dispose();
      if(c.material) c.material.dispose();
    }
    editor.setSelected(null);
    editor.removeGrowHandles();

    // Recreate blocks from parsed array
    parsed.forEach(blockData=>{
      try{
        if(typeof blockData !== 'object') return;

        // POSITION
        const posT = blockData.P || blockData.Position || blockData.Pos;
        if(!posT) return;
        const px = (typeof posT[0] === 'number') ? posT[0] : (posT.X || 0);
        const py = (typeof posT[1] === 'number') ? posT[1] : (posT.Y || 0);
        const pz = (typeof posT[2] === 'number') ? posT[2] : (posT.Z || 0);

        // SIZE
        const sizeT = blockData.S || blockData.Size;
        if(!sizeT) return;
        const sx = (typeof sizeT[0] === 'number') ? sizeT[0] : (sizeT.X || 1);
        const sy = (typeof sizeT[1] === 'number') ? sizeT[1] : (sizeT.Y || 1);
        const sz = (typeof sizeT[2] === 'number') ? sizeT[2] : (sizeT.Z || 1);

        // COLOR (expect normalized 0..1)
        const colT = blockData.C || blockData.Color;
        if(!colT) return;
        const r = (typeof colT[0] === 'number') ? colT[0] : (colT.R || 1);
        const g = (typeof colT[1] === 'number') ? colT[1] : (colT.G || 1);
        const b = (typeof colT[2] === 'number') ? colT[2] : (colT.B || 1);

        // optional flags with defaults: E=false, T=0, K=true, A=true
        const editable = (blockData.E !== undefined) ? !!blockData.E : (blockData.Editable || false);
        const transparency = (typeof blockData.T === 'number') ? blockData.T : (blockData.Transparency || 0);
        const canCollide = (blockData.K !== undefined) ? !!blockData.K : ( (blockData.CanCollide!==undefined) ? !!blockData.CanCollide : true );
        const anchored = (blockData.A !== undefined) ? !!blockData.A : ( (blockData.Anchored!==undefined) ? !!blockData.Anchored : true );

        const materialName = blockData.M || blockData.Material || null;

        // determine material or color to pass to editor.placeBlockAt
        let materialOrColor = null;
        let matName = null;
        if(materialName && editor.materials && editor.materials[materialName]){
          materialOrColor = editor.materials[materialName].material;
          matName = materialName;
        } else {
          materialOrColor = [r,g,b];
          matName = null;
        }

        // placeBlockAt expects base Y (ground) not center; ensure we pass baseY (center minus half height)
        const basePy = Math.round(py - (sy/2));

        if(editor.placeBlockAt){
          // pass extra userData flags via the created mesh's userData after creation
          const m = editor.placeBlockAt(Math.round(px), Math.round(basePy), Math.round(pz), Math.round(sx), Math.round(sy), Math.round(sz), materialOrColor, matName);
          if(m){
            // store compact flags back onto mesh userData for export later
            m.userData.E = editable === true;
            if(transparency && transparency > 0) m.userData.T = transparency;
            if(canCollide === false) m.userData.K = false;
            if(anchored === false) m.userData.A = false;
            // ensure userData.M and C are consistent
            if(matName) m.userData.M = matName;
            else m.userData.C = [Math.round(r*1000)/1000, Math.round(g*1000)/1000, Math.round(b*1000)/1000];
          }
        }
      }catch(e){}
    });

    // ensure grid offset is consistent after importing JSON
    try{
      if(editor.setGridMode) {
        const current = document.querySelector('input[name="gridMode"]:checked')?.value || 'normal';
        editor.setGridMode(current);
      }
    }catch(e){}

    // update JSON area to normalized formatting from engine
    if(editor.updateJSON) editor.updateJSON();
    jsonOut.value = document.getElementById("jsonOut").value;

    applyJsonBtn.textContent = "적용됨";
    setTimeout(()=>applyJsonBtn.textContent="JSON 적용",900);
  });

  [sizeInput].forEach(inp=>{
    inp.addEventListener("change", ()=>{
      // accept integer sizes >= 1 (do not force multiples of GRID_UNIT here)
      let raw = parseFloat(inp.value) || 1;
      raw = Math.max(1, Math.round(raw));
      inp.value = raw;
    });
  });

  // Keep JSON area updated initially
  editor.updateJSON();

  // TOP TOOLBAR wiring (rescale, paint, material, setting, json)
  function setActiveTool(name){
    // toggle behavior: if same tool clicked again, deactivate and hide UI
    const currentActive = document.querySelector('.toolIcon.active');
    const clickedBtn = document.getElementById('tool'+name.charAt(0).toUpperCase()+name.slice(1));
    const wasActive = clickedBtn && clickedBtn.classList.contains('active');

    // clear active on all icons
    document.querySelectorAll('.toolIcon').forEach(b=>b.classList.remove('active'));

    // hide UI initially
    const uiContainer = document.getElementById('ui');

    if(wasActive){
      // deactivate tool and hide bottom UI
      if(editor.setToolMode) editor.setToolMode(null);
      if(uiContainer) uiContainer.classList.remove('visible');
      // ensure no tab is active
      document.querySelectorAll('.tabBtn').forEach(x=>x.classList.remove('active'));
      // also hide rescale panel if present
      const rp = document.getElementById('rescalePanel');
      if(rp) rp.classList.add('hidden');
      return;
    }

    // activate clicked
    if(clickedBtn) clickedBtn.classList.add('active');
    if(editor.setToolMode) editor.setToolMode(name);

    // show bottom UI and switch to single relevant panel
    if(uiContainer) uiContainer.classList.add('visible');

    // Map tool names to tab ids
    const map = {
      rescale: 'rescale', // show rescale instruction panel
      paint: 'colors',
      material: 'materials',
      setting: 'settings',
      json: 'json',
      destroy: 'destroy' // new mapping for destroy panel
    };

    const targetTab = map[name] || null;

    // If a target tab is defined, activate it and ensure only its panels are visible.
    if(targetTab){
      // deactivate all tab buttons (if any) and mark the conceptual tab
      document.querySelectorAll('.tabBtn').forEach(btn=> btn.classList.remove('active'));
      // show/hide panels accordingly
      document.querySelectorAll('#panels .panel').forEach(p=>{
        const area = p.dataset.area;
        if(area === targetTab) p.classList.remove('hidden'); else p.classList.add('hidden');
      });
      // scroll palette to top
      const palette = document.getElementById('palette');
      if(palette && palette.scrollTo) palette.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // if tool has no panel, hide all panels but keep UI visible for contextual controls
      document.querySelectorAll('#panels .panel').forEach(p=>p.classList.add('hidden'));
      // also ensure rescale panel hidden just in case
      const rp = document.getElementById('rescalePanel');
      if(rp) rp.classList.add('hidden');
    }
  }
  // attach handlers to toolbar (create-safe because toolbar exists in DOM)
  ['Rescale','Paint','Material','Setting','Json','Destroy'].forEach(n=>{
    const id = 'tool'+n;
    const el = document.getElementById(id);
    if(el){
      el.addEventListener('click', (ev)=>{
        ev.preventDefault();
        setActiveTool(n.toLowerCase());
      });
      // touch friendly
      el.addEventListener('touchstart', (ev)=>{ ev.preventDefault(); setActiveTool(n.toLowerCase()); }, {passive:false});
    }
  });

  // tooltip behavior: show hover description near mouse for topbar icons
  const tooltip = document.getElementById('toolTip');
  function showTooltipFor(el, ev){
    if(!tooltip) return;
    const desc = el.dataset.desc || el.title || '';
    if(!desc) return;
    tooltip.textContent = desc;
    tooltip.classList.remove('hidden');
    positionTooltip(ev);
  }
  function positionTooltip(ev){
    if(!tooltip) return;
    const x = ev.clientX + 14;
    const y = ev.clientY + 14;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }
  function hideTooltip(){
    if(!tooltip) return;
    tooltip.classList.add('hidden');
  }

  // attach mousemove/mouseenter/mouseleave to topbar icons to follow pointer
  document.querySelectorAll('#topbar .toolIcon, #topright .toolIcon').forEach(btn=>{
    btn.addEventListener('mouseenter', (ev)=>{
      showTooltipFor(btn, ev);
      // listen for pointer move to reposition tooltip
      window.addEventListener('mousemove', positionTooltip);
    });
    btn.addEventListener('mousemove', (ev)=> positionTooltip(ev));
    btn.addEventListener('mouseleave', (ev)=>{
      hideTooltip();
      window.removeEventListener('mousemove', positionTooltip);
    });
    // also support touch: on touchstart show tooltip near touch point briefly
    btn.addEventListener('touchstart', (ev)=>{
      if(ev.touches && ev.touches[0]){
        showTooltipFor(btn, ev.touches[0]);
        setTimeout(hideTooltip, 1600);
      }
    }, {passive:true});
  });

  // ensure destroy-all button behaves with confirmation
  const destroyAllBtn = document.getElementById('destroyAllBtn');
  if(destroyAllBtn){
    destroyAllBtn.addEventListener('click', ()=>{
      const ok = confirm('정말 모두 삭제하시겠습니까?');
      if(!ok) return;
      if(editor.blocksGroup){
        while(editor.blocksGroup.children.length){
          const c = editor.blocksGroup.children[0];
          editor.blocksGroup.remove(c);
          if(c.geometry) try{ c.geometry.dispose(); }catch(e){}
          if(c.material) try{ c.material.dispose && c.material.dispose(); }catch(e){}
        }
        if(editor.setSelected) editor.setSelected(null);
        if(editor.removeGrowHandles) editor.removeGrowHandles();
        if(editor.updateJSON) editor.updateJSON();
        // also update json textarea if present
        const jsonOutEl = document.getElementById('jsonOut');
        if(jsonOutEl) jsonOutEl.value = document.getElementById("jsonOut").value;
      }
    });
  }

  // default: no tool active and UI hidden
  if(editor.setToolMode) editor.setToolMode(null);
  const uiContainerInit = document.getElementById('ui');
  if(uiContainerInit) uiContainerInit.classList.remove('visible');

  // Block contextual menu removed: right-click now deletes a block directly (handled in editor).
  // Block options UI has been removed — change properties by selecting a block and using Paint / Material tools.
  
  // expose small API if editor needs to update UI later
  // nothing else required here
}