import fs from 'fs';

const zoomSource = fs.readFileSync(new URL('../client/js/zoom.js', import.meta.url), 'utf8');

describe('camera region controls', () => {
  test('fits a logical region locally without changing room state', () => {
    expect(zoomSource).toContain('export function focusCameraRegionWidget(widget)');
    expect(zoomSource).toContain('viewportConfig.targetWidth / region.width');
    expect(zoomSource).toContain('viewportConfig.targetHeight / region.height');
    expect(zoomSource).toContain('setZoomLevel(targetZoom);');
    expect(zoomSource).toContain('setPan(-targetLeft * scale * targetZoom, -targetTop * scale * targetZoom);');
    expect(zoomSource).not.toContain("toServer('camera'");
  });

  test('exposes a large floating focus button with a persisted compact mode', () => {
    expect(zoomSource).toContain("const CAMERA_REGION_CONTROL_ID = 'cameraRegionControl';");
    expect(zoomSource).toContain("const CAMERA_REGION_COLLAPSED_KEY = 'cameraRegionControlsCollapsed';");
    expect(zoomSource).toContain("min-width:168px;height:60px");
    expect(zoomSource).toContain("width:52px;min-width:52px;height:52px");
    expect(zoomSource).toContain("localStorage.setItem(CAMERA_REGION_COLLAPSED_KEY");
  });

  test('auto-focuses only once after the primary region first becomes available', () => {
    expect(zoomSource).toContain('let cameraRegionAutoFocusDone = false;');
    expect(zoomSource).toContain("region.get('cameraRegionAutoFocus')");
    expect(zoomSource).toContain('cameraRegionAutoFocusDone = true;');
    expect(zoomSource).toContain('requestAnimationFrame(() => requestAnimationFrame(() => {');
  });
});
