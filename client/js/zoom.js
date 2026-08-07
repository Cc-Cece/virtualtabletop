import { viewportConfig } from './calculateLayout.js';

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 20;
const ZOOM_PRECISION = 10;
const KEYBOARD_ZOOM_STEP = 0.1;

let zoomScale = MIN_ZOOM;
let zoomLocked = localStorage.getItem('zoomLocked') === 'true';

export function clampZoomLevel(zoomLevel) {
  const rounded = Math.round(zoomLevel * ZOOM_PRECISION) / ZOOM_PRECISION;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rounded));
}

function setZoomLevel(zoomLevel) {
  zoomScale = clampZoomLevel(zoomLevel);
  
  $('#zoom2xButton .tooltip').textContent = `${zoomScale.toFixed(1)}x Zoom`;

  // Slider stores tenths so 1x-20x maps to 10-200.
  if($('#zoomSlider'))
    $('#zoomSlider').value = Math.round(zoomScale * ZOOM_PRECISION);

  // Zoomed mode - enable panning
  $('body').classList.toggle('zoom2x', zoomScale > MIN_ZOOM);
  document.documentElement.style.setProperty('--zoom', zoomScale);
  roomRectangle = $('#room').getBoundingClientRect();
  refreshIgnoreZoomWidgets();
}

export function getZoomLevel() {
  return zoomScale;
}

function resetZoomAndPan() {
  setZoomLevel(MIN_ZOOM);
  setPan(0, 0);
  $('body').classList.remove('panning');
}

function setPan(x, y) {
  // Clamp pan to valid range
  const maxPanX = viewportConfig.targetWidth * scale * zoomScale - viewportConfig.targetWidth * scale;
  const maxPanY = viewportConfig.targetHeight * scale * zoomScale - viewportConfig.targetHeight * scale;
  const clampedPanX = Math.max(-maxPanX, Math.min(0, x));
  const clampedPanY = Math.max(-maxPanY, Math.min(0, y));

  document.documentElement.style.setProperty('--roomPanX', clampedPanX + 'px');
  document.documentElement.style.setProperty('--roomPanY', clampedPanY + 'px');
  roomRectangle = $('#room').getBoundingClientRect();
  refreshIgnoreZoomWidgets();
}

function elementIsMovableWidget(el) {
  while(el) {
    if(el.id && el.id.slice(0,2) == 'w_' && el.classList && (el.classList.contains('movable') || el.classList.contains('canvas')) && widgets.has(unescapeID(el.id.slice(2))))
      return true;
    el = el.parentNode;
  }
  return false;
}

// set zoom level and pan so that the given point in the viewport remains at the same position on the screen
function setZoomAroundPoint(newZoomLevel, viewportPixelX, viewportPixelY) {
  // Calculate relative (0-1) location of point inside topSurface
  const roomRect = $('#topSurface').getBoundingClientRect();
  const relX = (viewportPixelX - roomRect.left) / roomRect.width;
  const relY = (viewportPixelY - roomRect.top) / roomRect.height;

  // Set new zoom level
  newZoomLevel = clampZoomLevel(newZoomLevel);
  if(newZoomLevel === zoomScale) return;
  setZoomLevel(newZoomLevel);

  const newRoomRect = $('#topSurface').getBoundingClientRect();
  const roomAreaRect = $('#roomArea').getBoundingClientRect();

  // Figure out how much we need to pan so the target lands under current mouse
  const panX = (viewportPixelX - relX * newRoomRect.width - roomAreaRect.left);
  const panY = (viewportPixelY - relY * newRoomRect.height - roomAreaRect.top);

  // Clamp pan to allowed range based on room size and area size
  setPan(panX, panY);
}

// set zoom level and pan so that the center of the visible room area remains at the same position on the screen
function setZoomAroundCenter(newZoomLevel) {
  const roomAreaRect = $('#roomArea').getBoundingClientRect();
  const centerX = roomAreaRect.left + roomAreaRect.width / 2;
  const centerY = roomAreaRect.top + roomAreaRect.height / 2;
  setZoomAroundPoint(newZoomLevel, centerX, centerY);
}

function refreshIgnoreZoomWidgets() {
  for(const widget of widgetFilter(w => w.get('ignoreZoom')))
    widget.applyCSS({ ignoreZoom: true });
}

onLoad(function() {
  // Zoom functionality with scroll wheel and drag-to-pan
  let isDraggingPan = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let panStartX = 0;
  let panStartY = 0;
  const pressedMouseButtons = new Set();
  let isSpacePanModifierActive = false;
  let isSpacePanPointerActive = false;
  let lastWheelZoomTime = 0;
  const minWheelZoomInterval = 40; // milliseconds between zoom events
  let zoomControlsHidden = true;

  const zoomSlider = $('#zoomSlider');
  if(zoomSlider) {
    zoomSlider.min = MIN_ZOOM * ZOOM_PRECISION;
    zoomSlider.max = MAX_ZOOM * ZOOM_PRECISION;
    zoomSlider.step = 1;
    zoomSlider.value = zoomScale * ZOOM_PRECISION;
  }

  function isEditableElement(target) {
    const editableTags = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
    return editableTags.includes(target.tagName) || target.isContentEditable;
  }

  function updateSpacePanClass() {
    document.body.classList.toggle('spacePanActive', isSpacePanModifierActive || isSpacePanPointerActive);
  }

  function stopDraggingPan() {
    isDraggingPan = false;
    document.body.classList.remove('panning');
  }

  function handleSpaceKeyDown(e) {
    if(edit && !overlayActive && !pressedMouseButtons.size && !Object.keys(mouseStatus).length && (e.code === 'Space' || e.key === ' ') && !isEditableElement(e.target)) {
      isSpacePanModifierActive = true;
      updateSpacePanClass();
      e.preventDefault();
    }
  }

  function handleSpaceKeyUp(e) {
    if (e.code === 'Space' || e.key === ' ') {
      isSpacePanModifierActive = false;
      updateSpacePanClass();
      if(edit && isDraggingPan)
        stopDraggingPan();
    }
  }

  function handleWindowBlur() {
    pressedMouseButtons.clear();
    isSpacePanModifierActive = false;
    isSpacePanPointerActive = false;
    updateSpacePanClass();
    if(isDraggingPan)
      stopDraggingPan();
  }

  // Button click toggles zoom controls panel
  on('#zoom2xButton', 'click', function(e){
    zoomControlsHidden = !zoomControlsHidden;
    $('#zoomControls').classList.toggle('hidden', zoomControlsHidden);
  });

  // Slider controls zoom level
  on('#zoomSlider', 'input', function(e) {
    setZoomAroundCenter(parseInt(e.target.value) / ZOOM_PRECISION);
  });

  // Lock button prevents zoom changes
  on('#lockZoomButton', 'click', function(e) {
    zoomLocked = !zoomLocked;
    localStorage.setItem('zoomLocked', zoomLocked);
    $('#lockZoomButton').classList.toggle('locked', zoomLocked);
  });

  // Restore locked state from localStorage
  if(zoomLocked)
    $('#lockZoomButton').classList.add('locked');

  // Scroll wheel zoom with zoom-to-cursor (relative to #room)
  on('#roomArea', 'wheel', function(e){
    if(overlayActive || zoomLocked)
      return; // allow normal wheel behavior when an overlay is active or zoom is locked
    e.preventDefault();

    const now = Date.now();
    if(now - lastWheelZoomTime < minWheelZoomInterval)
      return; // throttle zoom events to prevent excessive zoom speed
    lastWheelZoomTime = now;

    const delta = e.deltaY > 0 ? 0.85 : 1.15;
    setZoomAroundPoint(clampZoomLevel(zoomScale * delta), e.clientX, e.clientY);
  });

  // Page up/down zoom in consistent 0.1x steps across the full supported range.
  on('body', 'keydown', function(e){
    if(!overlayActive && !edit && !zoomLocked && (e.key === 'PageUp' || e.key === 'PageDown')) {
      e.preventDefault();
      const direction = e.key === 'PageUp' ? 1 : -1;
      setZoomAroundCenter(clampZoomLevel(zoomScale + direction * KEYBOARD_ZOOM_STEP));
    }
  });

  // Drag to pan functionality (left mouse only)
  on('#roomArea', 'mousedown', function(e){
    const spacePan = edit && isSpacePanModifierActive;
    if(e.button !== 0 || overlayActive)
      return;

    // If Space is held in edit mode, always prevent selection rectangle
    if(spacePan) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      isSpacePanPointerActive = true;
      updateSpacePanClass();

      // If zoomed in, start panning regardless of widget under cursor
      if(zoomScale > MIN_ZOOM && !isDraggingPan) {
        isDraggingPan = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        panStartX = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roomPanX')) || 0;
        panStartY = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roomPanY')) || 0;
        $('body').classList.add('panning');
      }
      return;
    }

    // Normal pan behavior when not in edit/space-pan
    if(zoomScale > MIN_ZOOM && !isDraggingPan && !elementIsMovableWidget(e.target) && !edit) {
      isDraggingPan = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      panStartX = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roomPanX')) || 0;
      panStartY = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roomPanY')) || 0;
      $('body').classList.add('panning');
    }
  });

  // Middle-click toggle zoom (anchor under cursor)
  on('#roomArea', 'mousedown', function(e){
    if(e.button !== 1 || edit || overlayActive || zoomLocked)
      return;

    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();

    setZoomAroundPoint(zoomScale === MIN_ZOOM ? 2 : MIN_ZOOM, e.clientX, e.clientY);
  });

  // Swallow middle-button mouseup to avoid widget interactions
  on('#roomArea', 'mouseup', function(e){
    if(e.button === 1 && !edit && !overlayActive && !zoomLocked) {
      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();
    }
  });

  on('body', 'mousemove', function(e){
    if(isDraggingPan) {
      if(edit && !isSpacePanModifierActive) {
        stopDraggingPan();
        return;
      }
      setPan(panStartX + (e.clientX - dragStartX), panStartY + (e.clientY - dragStartY));
    }
  });

  on('body', 'mouseup', function(e){
    if(isDraggingPan)
      stopDraggingPan();
    if(isSpacePanPointerActive) {
      isSpacePanPointerActive = false;
      setTimeout(updateSpacePanClass);
    }
  });

  // Touch: one-finger pan and pinch-to-zoom
  let touchState = {
    isPanning: false,
    startX: 0,
    startY: 0,
    panStartX: 0,
    panStartY: 0,
    // pinch
    isPinching: false,
    startDist: 0,
    startZoom: MIN_ZOOM,
    anchorRelX: 0.5,
    anchorRelY: 0.5
  };

  function touchOnMovable(touch) {
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    return elementIsMovableWidget(el);
  }

  on('#roomArea', 'touchstart', function(e){
    // Start panning only when zoomed and not on draggable widget
    // Block if finger is on a movable widget
    if(!edit && !overlayActive && zoomScale > MIN_ZOOM && e.touches.length == 1 && !touchOnMovable(e.touches[0])) {
      touchState.isPanning = true;
      touchState.startX = e.touches[0].clientX;
      touchState.startY = e.touches[0].clientY;
      touchState.panStartX = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roomPanX')) || 0;
      touchState.panStartY = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roomPanY')) || 0;
      $('body').classList.add('panning');
    } else if(!overlayActive && !zoomLocked && e.touches.length == 2 && !touchOnMovable(e.touches[0]) && !touchOnMovable(e.touches[1])) {
      touchState.isPanning = false;
      touchState.isPinching = true;
      touchState.startZoom = zoomScale;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchState.startDist = Math.hypot(dx, dy);
      // Anchor: midpoint relative to room
      const roomRect = $('#topSurface').getBoundingClientRect();
      const midX = (e.touches[0].clientX + e.touches[1].clientX)/2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY)/2;
      touchState.anchorRelX = (midX - roomRect.left) / roomRect.width;
      touchState.anchorRelY = (midY - roomRect.top) / roomRect.height;
    }
  });

  on('#roomArea', 'touchmove', function(e){
    if(touchState.isPanning && e.touches.length == 1 && !touchOnMovable(e.touches[0])) {
      e.preventDefault();
      setPan(touchState.panStartX + (e.touches[0].clientX - touchState.startX), touchState.panStartY + (e.touches[0].clientY - touchState.startY));
    } else if(touchState.isPinching && !zoomLocked && e.touches.length == 2 && !touchOnMovable(e.touches[0]) && !touchOnMovable(e.touches[1])) {
      e.preventDefault();
      const dist = Math.hypot((e.touches[0].clientX - e.touches[1].clientX), (e.touches[0].clientY - e.touches[1].clientY));
      if(touchState.startDist <= 0)
        return;
      setZoomAroundPoint(clampZoomLevel(touchState.startZoom * (dist / touchState.startDist)), (e.touches[0].clientX + e.touches[1].clientX)/2, (e.touches[0].clientY + e.touches[1].clientY)/2);
    }
  });

  on('#roomArea', 'touchend', function(e){
    if(e.touches.length == 0) {
      touchState.isPanning = false;
      touchState.isPinching = false;
      $('body').classList.remove('panning');
    }
  });

  on('body', 'mouseleave', function(e){
    if(isDraggingPan) {
      isDraggingPan = false;
      $('body').classList.remove('panning');
    }
  });

  window.addEventListener('keydown', handleSpaceKeyDown);
  window.addEventListener('keyup', handleSpaceKeyUp);
  window.addEventListener('mousedown', e => pressedMouseButtons.add(e.button), true);
  window.addEventListener('mouseup', e => pressedMouseButtons.delete(e.button), true);
  window.addEventListener('blur', handleWindowBlur);
});
