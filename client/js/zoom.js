import { viewportConfig } from './calculateLayout.js';

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 20;
const ZOOM_PRECISION = 10;
const KEYBOARD_ZOOM_STEP = 0.1;
const CAMERA_REGION_CONTROL_ID = 'cameraRegionControl';
const CAMERA_REGION_FOCUS_ID = 'cameraRegionFocusButton';
const CAMERA_REGION_COLLAPSE_ID = 'cameraRegionCollapseButton';
const CAMERA_REGION_COLLAPSED_KEY = 'cameraRegionControlsCollapsed';
const HOVER_PREVIEW_MIN_PERCENT = 50;
const HOVER_PREVIEW_MAX_PERCENT = 300;
const HOVER_PREVIEW_DEFAULT_PERCENT = 100;
const HOVER_PREVIEW_STORAGE_KEY = 'hoverPreviewScalePercent';
const HOVER_PREVIEW_SLIDER_ID = 'hoverPreviewScaleSlider';
const HOVER_PREVIEW_VALUE_ID = 'hoverPreviewScaleValue';

let zoomScale = MIN_ZOOM;
let zoomLocked = localStorage.getItem('zoomLocked') === 'true';
let cameraRegionAutoFocusDone = false;
let cameraRegionAutoFocusRegionID = null;
let hoverPreviewPercent = clampHoverPreviewPercent(localStorage.getItem(HOVER_PREVIEW_STORAGE_KEY));

export function clampZoomLevel(zoomLevel) {
  const rounded = Math.round(zoomLevel * ZOOM_PRECISION) / ZOOM_PRECISION;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rounded));
}

function clampHoverPreviewPercent(value) {
  if(value === null || value === '')
    return HOVER_PREVIEW_DEFAULT_PERCENT;
  const parsed = Number(value);
  if(!Number.isFinite(parsed))
    return HOVER_PREVIEW_DEFAULT_PERCENT;
  return Math.max(HOVER_PREVIEW_MIN_PERCENT, Math.min(HOVER_PREVIEW_MAX_PERCENT, Math.round(parsed)));
}

function setHoverPreviewPercent(value, persist = true) {
  hoverPreviewPercent = clampHoverPreviewPercent(value);
  document.documentElement.style.setProperty('--hoverPreviewScale', hoverPreviewPercent / 100);

  const slider = document.getElementById(HOVER_PREVIEW_SLIDER_ID);
  if(slider)
    slider.value = hoverPreviewPercent;

  const output = document.getElementById(HOVER_PREVIEW_VALUE_ID);
  if(output)
    output.textContent = `${hoverPreviewPercent}%`;

  if(persist)
    localStorage.setItem(HOVER_PREVIEW_STORAGE_KEY, hoverPreviewPercent);
}

function installHoverPreviewScaling() {
  if(Widget.prototype.showEnlarged.__hoverPreviewScaleWrapped)
    return;

  const originalShowEnlarged = Widget.prototype.showEnlarged;
  const wrappedShowEnlarged = function(...args) {
    const result = originalShowEnlarged.apply(this, args);
    const enlarged = $('#enlarged');
    if(enlarged && this.get('enlarge'))
      enlarged.style.transform += ' scale(var(--hoverPreviewScale, 1))';
    return result;
  };
  wrappedShowEnlarged.__hoverPreviewScaleWrapped = true;
  Widget.prototype.showEnlarged = wrappedShowEnlarged;
}

function ensureHoverPreviewControl() {
  const controls = $('#zoomControls');
  if(!controls || document.getElementById(HOVER_PREVIEW_SLIDER_ID))
    return;

  const separator = document.createElement('span');
  separator.setAttribute('aria-hidden', 'true');
  separator.style.cssText = 'width:1px;align-self:stretch;margin:3px 4px;background:currentColor;opacity:.35;';

  const label = document.createElement('label');
  label.htmlFor = HOVER_PREVIEW_SLIDER_ID;
  label.textContent = 'Preview';
  label.title = 'Hover preview size (local to this browser)';
  label.style.cssText = 'display:flex;align-items:center;padding-left:2px;font-size:12px;';

  const slider = document.createElement('input');
  slider.id = HOVER_PREVIEW_SLIDER_ID;
  slider.type = 'range';
  slider.min = HOVER_PREVIEW_MIN_PERCENT;
  slider.max = HOVER_PREVIEW_MAX_PERCENT;
  slider.step = 1;
  slider.value = hoverPreviewPercent;
  slider.setAttribute('aria-label', 'Hover preview size');
  slider.title = 'Hover preview size: 50%–300%';
  slider.style.width = '110px';

  const output = document.createElement('output');
  output.id = HOVER_PREVIEW_VALUE_ID;
  output.setAttribute('for', HOVER_PREVIEW_SLIDER_ID);
  output.textContent = `${hoverPreviewPercent}%`;
  output.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;min-width:38px;padding-right:4px;font-size:12px;font-variant-numeric:tabular-nums;';

  slider.addEventListener('input', e => setHoverPreviewPercent(e.target.value));

  controls.appendChild(separator);
  controls.appendChild(label);
  controls.appendChild(slider);
  controls.appendChild(output);
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

function primaryCameraRegionWidget() {
  const regions = widgetFilter(w => w.get('cameraRegion'));
  return regions.find(w => w.get('cameraRegionPrimary')) || regions[0] || null;
}

function cameraRegionBounds(widget) {
  const regionScale = Math.abs(Number(widget.get('scale')) || 1);
  return {
    x: Number(widget.get('x')) || 0,
    y: Number(widget.get('y')) || 0,
    width: Math.max(1, Number(widget.get('width')) || 1) * regionScale,
    height: Math.max(1, Number(widget.get('height')) || 1) * regionScale
  };
}

/**
 * Fit a logical board region into the current board viewport for this client only.
 * The board itself keeps its configured aspect ratio; arbitrary region ratios are centered
 * and fitted without cropping. No room state is changed and other players are unaffected.
 */
export function focusCameraRegionWidget(widget) {
  if(!widget)
    return false;

  const region = cameraRegionBounds(widget);
  const targetZoom = clampZoomLevel(Math.min(
    viewportConfig.targetWidth / region.width,
    viewportConfig.targetHeight / region.height
  ));

  const visibleWidth = viewportConfig.targetWidth / targetZoom;
  const visibleHeight = viewportConfig.targetHeight / targetZoom;
  const targetLeft = region.x - (visibleWidth - region.width) / 2;
  const targetTop = region.y - (visibleHeight - region.height) / 2;

  setZoomLevel(targetZoom);
  setPan(-targetLeft * scale * targetZoom, -targetTop * scale * targetZoom);
  return true;
}

export function focusPrimaryCameraRegion() {
  return focusCameraRegionWidget(primaryCameraRegionWidget());
}

function setCameraRegionControlCollapsed(collapsed) {
  localStorage.setItem(CAMERA_REGION_COLLAPSED_KEY, collapsed ? 'true' : 'false');
  refreshCameraRegionControl();
}

function ensureCameraRegionControl() {
  let shell = document.getElementById(CAMERA_REGION_CONTROL_ID);
  if(shell)
    return shell;

  shell = document.createElement('div');
  shell.id = CAMERA_REGION_CONTROL_ID;
  shell.style.cssText = 'position:fixed;right:calc(18px + env(safe-area-inset-right,0px));bottom:calc(18px + env(safe-area-inset-bottom,0px));z-index:10020;display:none;align-items:stretch;gap:6px;pointer-events:auto;font-family:inherit;';

  const focusButton = document.createElement('button');
  focusButton.id = CAMERA_REGION_FOCUS_ID;
  focusButton.type = 'button';
  focusButton.addEventListener('click', () => focusPrimaryCameraRegion());

  const collapseButton = document.createElement('button');
  collapseButton.id = CAMERA_REGION_COLLAPSE_ID;
  collapseButton.type = 'button';
  collapseButton.addEventListener('click', () => {
    const collapsed = localStorage.getItem(CAMERA_REGION_COLLAPSED_KEY) === 'true';
    setCameraRegionControlCollapsed(!collapsed);
  });

  shell.appendChild(focusButton);
  shell.appendChild(collapseButton);
  document.body.appendChild(shell);
  return shell;
}

function refreshCameraRegionControl() {
  const shell = ensureCameraRegionControl();
  const focusButton = document.getElementById(CAMERA_REGION_FOCUS_ID);
  const collapseButton = document.getElementById(CAMERA_REGION_COLLAPSE_ID);
  const region = primaryCameraRegionWidget();

  if(!focusButton || !collapseButton)
    return;

  if(!region) {
    shell.style.display = 'none';
    cameraRegionAutoFocusDone = false;
    cameraRegionAutoFocusRegionID = null;
    return;
  }

  shell.style.display = 'flex';
  const label = String(region.get('cameraRegionLabel') || '🎯 Focus region');
  const collapsed = localStorage.getItem(CAMERA_REGION_COLLAPSED_KEY) === 'true';

  focusButton.textContent = collapsed ? '🎯' : label;
  focusButton.title = label;
  focusButton.setAttribute('aria-label', label);
  focusButton.style.cssText = collapsed
    ? 'width:52px;min-width:52px;height:52px;padding:0;border:1px solid #b99552;border-radius:14px;background:#203b33ee;color:#ffe3a1;font-size:24px;font-weight:700;box-shadow:0 4px 14px #0009;cursor:pointer;backdrop-filter:blur(4px);'
    : 'min-width:168px;height:60px;padding:0 18px;border:1px solid #b99552;border-radius:14px;background:#203b33ee;color:#ffe3a1;font-size:18px;font-weight:700;box-shadow:0 4px 14px #0009;cursor:pointer;backdrop-filter:blur(4px);';

  collapseButton.textContent = collapsed ? '›' : '‹';
  collapseButton.title = collapsed ? 'Expand camera button' : 'Collapse camera button';
  collapseButton.setAttribute('aria-label', collapseButton.title);
  collapseButton.style.cssText = collapsed
    ? 'width:24px;height:52px;padding:0;border:1px solid #75887f;border-radius:10px;background:#172822e8;color:#d7e3dd;font-size:17px;font-weight:700;box-shadow:0 3px 10px #0007;cursor:pointer;'
    : 'width:30px;height:60px;padding:0;border:1px solid #75887f;border-radius:10px;background:#172822e8;color:#d7e3dd;font-size:20px;font-weight:700;box-shadow:0 3px 10px #0007;cursor:pointer;';

  const regionID = region.get('id');
  if(cameraRegionAutoFocusRegionID !== regionID) {
    cameraRegionAutoFocusRegionID = regionID;
    cameraRegionAutoFocusDone = false;
  }

  if(!cameraRegionAutoFocusDone && region.get('cameraRegionAutoFocus')) {
    cameraRegionAutoFocusDone = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const currentRegion = primaryCameraRegionWidget();
      if(currentRegion && currentRegion.get('id') === regionID)
        focusCameraRegionWidget(currentRegion);
    }));
  }
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

  installHoverPreviewScaling();
  ensureHoverPreviewControl();
  setHoverPreviewPercent(hoverPreviewPercent, false);

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
    const newZoomLevel = clampZoomLevel(zoomScale * delta);
    setZoomAroundPoint(newZoomLevel, e.clientX, e.clientY);
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

  refreshCameraRegionControl();
  window.setInterval(refreshCameraRegionControl, 750);
});
