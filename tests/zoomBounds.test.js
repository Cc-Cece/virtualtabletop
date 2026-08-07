import fs from 'fs';

const zoomSource = fs.readFileSync(new URL('../client/js/zoom.js', import.meta.url), 'utf8');

describe('camera zoom bounds', () => {
  test('uses one shared 1x-20x range', () => {
    expect(zoomSource).toContain('export const MIN_ZOOM = 1;');
    expect(zoomSource).toContain('export const MAX_ZOOM = 20;');
    expect(zoomSource).toContain('Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rounded))');
  });

  test('exposes the full range through the toolbar slider', () => {
    expect(zoomSource).toContain('zoomSlider.max = MAX_ZOOM * ZOOM_PRECISION;');
    expect(zoomSource).toContain('zoomSlider.min = MIN_ZOOM * ZOOM_PRECISION;');
  });

  test('routes wheel, keyboard and pinch zoom through the shared clamp', () => {
    expect(zoomSource).toContain('clampZoomLevel(zoomScale * delta)');
    expect(zoomSource).toContain('clampZoomLevel(zoomScale + direction * KEYBOARD_ZOOM_STEP)');
    expect(zoomSource).toContain('clampZoomLevel(touchState.startZoom * (dist / touchState.startDist))');
    expect(zoomSource).not.toContain('Math.min(10');
    expect(zoomSource).not.toContain('const zoomLevels =');
  });
});
