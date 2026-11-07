// main.js: wires the scene, camera controls, input and toolbar together and runs the render loop.
import * as THREE from 'three';
import { createScene, tileToWorld } from './scene.js';
import { initControls } from './controls.js';
import { initInput, on } from './input.js';
import { initUI } from './ui.js';

function start() {
  const container = document.getElementById('app');
  const { renderer, scene, camera } = createScene(container);
  initControls(camera, renderer.domElement);
  initInput(renderer.domElement, camera);
  initUI(document.getElementById('ui'));

  // TEMP: highlight the tapped tile to check picking. A later task removes this.
  const highlight = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.3, 1),
    new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  highlight.visible = false;
  scene.add(highlight);
  on('tap', ({ tile }) => {
    highlight.visible = !!tile;
    if (tile) tileToWorld(tile.x, tile.z, highlight.position).y = 0.15;
  });

  renderer.setAnimationLoop(() => renderer.render(scene, camera));

  // Handle for poking at the game from the browser console.
  window.sapCity = { renderer, scene, camera };
}

try {
  start();
} catch (err) {
  console.error(err);
  document.getElementById('fallback').hidden = false;
}
