// app.js - bootstrap loader. (keeps minimal responsibility)
// removed large original app.js content which was moved into src/editor.js and src/ui.js

import { startEditor } from "./src/editor.js";

startEditor();

// Play background music (MUS_GAME.wav) in a loop.
// Try to autoplay; if the browser blocks it, resume on first user gesture.
(function playBackgroundMusic(){
  try{
    const audio = new Audio('/MUS_GAME.wav');
    audio.loop = true;
    audio.volume = 0.38; // reasonable default volume
    // Try to play immediately (may be blocked)
    const tryPlay = () => {
      audio.play().catch(()=>{ /* ignore interdicted autoplay until user gesture */ });
    };
    tryPlay();

    // If not playing, resume on first user gesture then remove listeners
    const resume = () => {
      audio.play().catch(()=>{});
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('touchstart', resume);
      window.removeEventListener('keydown', resume);
    };
    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('touchstart', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });

    // Expose for debugging if needed
    window.__backgroundMusic = audio;
  }catch(e){}
})();

// --- Music toggle UI (top-left) wiring ---
// If the DOM element exists, wire it to control the background audio.
// Default state: ON (uses MUS_ON.png and "음악 : 켜짐")
(function wireMusicToggle(){
  function updateUI(isOn){
    const icon = document.getElementById('musicToggleIcon');
    const label = document.getElementById('musicToggleLabel');
    const btn = document.getElementById('musicToggle');
    if(!icon || !label || !btn) return;
    if(isOn){
      icon.src = '/MUS_ON.png';
      icon.style.opacity = '1.0';
      label.textContent = '음악 : 켜짐';
      btn.setAttribute('aria-pressed','true');
      btn.classList.remove('muted');
    } else {
      icon.src = '/MUS_OFF.png';
      icon.style.opacity = '0.45';
      label.textContent = '음악 : 꺼짐 :(';
      btn.setAttribute('aria-pressed','false');
      btn.classList.add('muted');
    }
  }

  // Wait for DOM ready if necessary
  const init = () => {
    const btn = document.getElementById('musicToggle');
    if(!btn) return;
    // ensure initial UI reflects playing state (default ON)
    const audio = window.__backgroundMusic;
    const isPlaying = audio ? !audio.paused : true;
    updateUI(isPlaying);

    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      const audio = window.__backgroundMusic;
      if(!audio){
        // if audio is not available, just toggle UI to OFF visually
        const currentlyOn = btn.getAttribute('aria-pressed') === 'true';
        updateUI(!currentlyOn);
        return;
      }
      if(audio.paused){
        audio.play().catch(()=>{});
        updateUI(true);
      } else {
        audio.pause();
        updateUI(false);
      }
    });
  };

  if(document.readyState === 'complete' || document.readyState === 'interactive'){
    setTimeout(init, 0);
  } else {
    window.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();