import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createHilbert, clampReveal } from './hilbert.js';
import './style.css';

const $ = (id) => document.getElementById(id);
const format = (n) => n.toLocaleString('en-US');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = { order: 3, mode: 'wireframe', palette: 'spectrum', revealed: 512, playing: false };
let renderer, controls, camera, scene, curve, cube, positions, colors, geometry, material, mesh;
let needsRender = true;
let total = 512, elapsed = 0, previousTime = 0, revealProgress = 512, toastTimer;
const baseDistance = 6.5;
const vector = new THREE.Vector3();
const color = new THREE.Color();

function fillRange(input) {
  const percentage = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100;
  input.style.setProperty('--fill', `${percentage}%`);
}
document.querySelectorAll('input[type=range]').forEach(input => {
  fillRange(input);
  input.addEventListener('input', () => fillRange(input));
});
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2400);
}
function createColors() {
  colors = new Float32Array(total * 3);
  for (let i = 0; i < total; i++) {
    const t = i / Math.max(1, total - 1);
    if (state.palette === 'spectrum') color.setHSL(0.75 - t * 0.75, 0.78, 0.62);
    if (state.palette === 'aurora') color.setHSL(0.72 - t * 0.42, 0.7, 0.59);
    if (state.palette === 'ember') color.setHSL(0.01 + t * 0.14, 0.9, 0.55);
    if (state.palette === 'lime') color.setHSL(0.22, 0.55, 0.4 + 0.3 * t);
    color.toArray(colors, i * 3);
  }
}
function disposeCurve() {
  if (!mesh) return;
  curve.remove(mesh);
  if (mesh.isInstancedMesh) mesh.dispose();
  geometry.dispose();
  material.map?.dispose();
  material.dispose();
}
function buildCurve() {
  disposeCurve();
  createColors();
  if (state.mode === 'wireframe' || state.mode === 'dots') {
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (state.mode === 'wireframe') {
      material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.94 });
      mesh = new THREE.Line(geometry, material);
    } else {
      const phases = new Float32Array(total);
      for (let i = 0; i < total; i++) phases[i] = i * 2.399963;
      geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
      material = new THREE.ShaderMaterial({
        vertexColors: true, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uSize: { value: Number($('point-size').value) }, uPulse: { value: Number($('pulse').value) }, uPixelRatio: { value: renderer.getPixelRatio() } },
        vertexShader: `attribute float phase;
          uniform float uTime; uniform float uSize; uniform float uPulse; uniform float uPixelRatio;
          varying vec3 vColor; varying float vPulse;
          void main() {
            vColor = color;
            vPulse = uPulse == 0.0 ? 1.0 : 0.3 + 0.7 * (0.5 + 0.5 * sin(uTime * uPulse * 3.0 + phase));
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = clamp(uSize * uPixelRatio * (0.5 + vPulse * 0.5) * 6.5 / max(0.1, -mv.z), 1.0, 96.0);
          }`,
        fragmentShader: `varying vec3 vColor; varying float vPulse;
          void main() {
            float radius = length(gl_PointCoord - 0.5) * 2.0;
            if (radius > 1.0) discard;
            float glow = pow(1.0 - radius, 1.3);
            gl_FragColor = vec4(vColor * (0.7 + vPulse * 0.8), glow * vPulse);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      });
      mesh = new THREE.Points(geometry, material);
    }
  } else {
    // One cylinder per face-adjacent segment. Instancing keeps draw calls constant.
    const spacing = 2 / (2 ** state.order - 1);
    const radius = spacing * 0.065;
    geometry = new THREE.CylinderGeometry(radius, radius, spacing, 6, 1, false);
    let texture = null;
    if (state.mode === 'textured') {
      const data = new Uint8Array(8 * 32 * 4);
      for (let y = 0; y < 32; y++) for (let x = 0; x < 8; x++) {
        const offset = (y * 8 + x) * 4;
        const shade = (x + y) % 8 < 3 ? 90 : 255;
        data.set([shade, shade, shade, 255], offset);
      }
      texture = new THREE.DataTexture(data, 8, 32);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.magFilter = THREE.NearestFilter;
      texture.needsUpdate = true;
    }
    material = new THREE.MeshStandardMaterial({ map: texture, roughness: state.mode === 'textured' ? 0.65 : 0.32, metalness: 0.18 });
    mesh = new THREE.InstancedMesh(geometry, material, total - 1);
    const dummy = new THREE.Object3D();
    const start = new THREE.Vector3(), end = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < total - 1; i++) {
      start.fromArray(positions, i * 3);
      end.fromArray(positions, (i + 1) * 3);
      dummy.position.copy(start).add(end).multiplyScalar(0.5);
      dummy.quaternion.setFromUnitVectors(up, vector.subVectors(end, start).normalize());
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.fromArray(colors, i * 3));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  curve.add(mesh);
  updateReveal(state.revealed);
  $('dot-controls').hidden = state.mode !== 'dots';
  $('style-label').textContent = state.mode === 'dots' ? 'BLINKING DOTS' : state.mode.toUpperCase();
  $('canvas-container').dataset.mode = state.mode;
}
function updateReveal(value) {
  needsRender = true;
  state.revealed = clampReveal(value, total);
  if (mesh?.isInstancedMesh) mesh.count = Math.max(0, state.revealed - 1);
  else geometry?.setDrawRange(0, state.revealed);
  // A single revealed vertex has no line segment; show its position explicitly.
  const first = scene.getObjectByName('first-point');
  first.visible = state.revealed === 1 && state.mode !== 'dots';
  first.position.fromArray(positions);
  first.material.color.fromArray(colors);
  $('reveal').value = state.revealed;
  $('revealed-number').value = state.revealed;
  $('reveal-caption').textContent = `${format(state.revealed)} / ${format(total)} POINTS`;
  $('reveal-percent').innerHTML = `${Math.round(state.revealed / total * 100)}<span>%</span>`;
  $('canvas-container').dataset.revealed = state.revealed;
  fillRange($('reveal'));
}
function setPlaying(playing) {
  state.playing = playing;
  $('play').textContent = playing ? 'Ⅱ' : '▶';
  $('play').setAttribute('aria-label', playing ? 'Pause reveal' : 'Animate reveal');
  $('play').setAttribute('aria-pressed', String(playing));
}
function manualReveal(value) {
  setPlaying(false);
  updateReveal(value);
  revealProgress = state.revealed;
}
function setView(view) {
  controls.target.set(0, 0, 0);
  camera.up.set(0, 1, 0);
  const directions = { iso: [1.25, 0.9, 1.4], front: [0, 0, 1], top: [0, 1, 0.0001], side: [1, 0, 0] };
  camera.position.fromArray(directions[view]).normalize().multiplyScalar(baseDistance * 100 / Number($('zoom').value));
  controls.update();
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('selected', button.dataset.view === view));
}
function resetView() {
  $('zoom').value = 100;
  $('auto-rotate').checked = false;
  controls.autoRotate = false;
  curve.rotation.set(0, 0, 0);
  for (const axis of ['x', 'y', 'z']) { $(`rotate-${axis}`).value = 0; fillRange($(`rotate-${axis}`)); }
  setView('iso');
}
function resize() {
  needsRender = true;
  const { width, height } = $('canvas-container').getBoundingClientRect();
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(width, height);
  if (material?.uniforms) material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
}
function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.domElement.setAttribute('aria-label', '3D Hilbert curve. Drag to orbit, scroll to zoom, or use the camera controls.');
  renderer.domElement.setAttribute('role', 'img');
  $('canvas-container').appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
  curve = new THREE.Group();
  scene.add(curve);
  scene.add(new THREE.HemisphereLight(0xeaffdf, 0x38405a, 2.4));
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(3, 5, 4);
  scene.add(light);
  const box = new THREE.BoxGeometry(2.08, 2.08, 2.08);
  cube = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: 0x637353, transparent: true, opacity: 0.25 }));
  box.dispose();
  curve.add(cube);
  const first = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial());
  first.name = 'first-point';
  curve.add(first);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = baseDistance / 2.5;
  controls.maxDistance = baseDistance / 0.35;
  controls.autoRotateSpeed = 1;
  controls.addEventListener('change', () => {
    needsRender = true;
    const zoom = Math.round(baseDistance / camera.position.distanceTo(controls.target) * 100);
    $('zoom').value = zoom;
    $('zoom-value').textContent = `${zoom}%`;
    fillRange($('zoom'));
  });
  controls.addEventListener('start', () => document.querySelectorAll('[data-view]').forEach(button => button.classList.remove('selected')));
  positions = createHilbert(state.order);
  buildCurve();
  setView('iso');
  new ResizeObserver(resize).observe($('canvas-container'));
  resize();
  if (reducedMotion) { $('pulse').value = 0; $('pulse-value').textContent = '0.0'; fillRange($('pulse')); }
  wireControls();
  renderer.setAnimationLoop((time) => {
    const delta = Math.min((time - (previousTime || time)) / 1000, 0.1);
    previousTime = time;
    elapsed += delta;
    if (state.playing) {
      revealProgress += delta * total / Number($('duration').value);
      if (revealProgress >= total) {
        if ($('loop').checked) revealProgress %= total;
        else { revealProgress = total; setPlaying(false); }
      }
      if (Math.floor(revealProgress) !== state.revealed) updateReveal(revealProgress);
    }
    if (material.uniforms) material.uniforms.uTime.value = elapsed;
    controls.update(delta);
    const pulsing = material.uniforms && material.uniforms.uPulse.value > 0;
    if (needsRender || pulsing) {
      renderer.render(scene, camera);
      needsRender = false;
    }
  });
  $('canvas-container').dataset.ready = 'true';
}
function wireControls() {
  // Static scenes need no GPU redraw until a control or the camera changes.
  for (const event of ['input', 'change', 'click']) document.addEventListener(event, () => { needsRender = true; });
  $('order').addEventListener('input', () => {
    const ratio = state.revealed / total;
    state.order = Number($('order').value);
    total = 8 ** state.order;
    positions = createHilbert(state.order);
    state.revealed = Math.round(total * ratio);
    revealProgress = state.revealed;
    $('order-value').value = state.order;
    $('total-points').textContent = format(total);
    $('grid-size').textContent = Array(3).fill(2 ** state.order).join(' × ');
    $('reveal').max = $('revealed-number').max = total;
    $('order-note').textContent = state.order >= 5 ? 'Dense geometry. Wireframe and dots are the lightest modes.' : 'Every order folds the path into eight smaller copies.';
    buildCurve();
  });
  document.querySelectorAll('button[data-mode]').forEach(button => button.addEventListener('click', () => {
    state.mode = button.dataset.mode;
    document.querySelectorAll('button[data-mode]').forEach(item => {
      item.classList.toggle('active', item === button);
      item.setAttribute('aria-pressed', String(item === button));
    });
    buildCurve();
  }));
  $('palette').addEventListener('change', () => { state.palette = $('palette').value; buildCurve(); });
  $('bounds').addEventListener('change', () => { cube.visible = $('bounds').checked; });
  $('point-size').addEventListener('input', () => { $('point-size-value').textContent = `${$('point-size').value} px`; if (material.uniforms) material.uniforms.uSize.value = Number($('point-size').value); });
  $('pulse').addEventListener('input', () => { $('pulse-value').textContent = Number($('pulse').value).toFixed(1); if (material.uniforms) material.uniforms.uPulse.value = Number($('pulse').value); });
  $('reveal').addEventListener('input', () => manualReveal($('reveal').value));
  $('revealed-number').addEventListener('change', () => manualReveal($('revealed-number').value));
  $('play').addEventListener('click', () => {
    if (!state.playing && state.revealed >= total) { revealProgress = 0; updateReveal(0); }
    setPlaying(!state.playing);
  });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  $('zoom').addEventListener('input', () => {
    vector.subVectors(camera.position, controls.target).setLength(baseDistance * 100 / Number($('zoom').value));
    camera.position.copy(controls.target).add(vector);
    controls.update();
  });
  for (const axis of ['x', 'y', 'z']) $(`rotate-${axis}`).addEventListener('input', () => { curve.rotation[axis] = THREE.MathUtils.degToRad(Number($(`rotate-${axis}`).value)); });
  $('auto-rotate').addEventListener('change', () => { controls.autoRotate = $('auto-rotate').checked; });
  $('rotation-speed').addEventListener('input', () => { controls.autoRotateSpeed = Number($('rotation-speed').value); $('rotation-speed-value').textContent = `${controls.autoRotateSpeed.toFixed(1)}×`; });
  $('reset').addEventListener('click', resetView);
  $('fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if ($('canvas-container').parentElement.requestFullscreen) await $('canvas-container').parentElement.requestFullscreen();
      else toast('Fullscreen is unavailable in this browser.');
    } catch { toast('Fullscreen is unavailable in this browser.'); }
  });
  $('snapshot').addEventListener('click', () => {
    renderer.render(scene, camera);
    renderer.domElement.toBlob(blob => {
      if (!blob) { toast('Image could not be created.'); return; }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `hilbert-order-${state.order}-${state.mode}.png`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Image saved.');
    });
  });
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); renderer.setAnimationLoop(null);
    $('render-error').textContent = 'The graphics context was lost. Reload the page to resume.';
    $('render-error').hidden = false;
  });
}
try { init(); }
catch (error) {
  console.error(error);
  $('render-error').hidden = false;
  $('canvas-container').dataset.ready = 'false';
}
