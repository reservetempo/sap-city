// main.js: wires the scene, camera controls, input, toolbar, city and placement
// together and runs the render loop.
import * as THREE from 'three';
import { createScene } from './scene.js';
import { initControls } from './controls.js';
import { initInput } from './input.js';
import { initUI } from './ui.js';
import * as city from './city.js';
import { createBuildingMesh } from './buildingMeshes.js';
import { initPlacement } from './placement.js';

/** Keeps one mesh per city object in `parent`, following city change events. */
function syncCityMeshes(parent) {
  const makers = { building: createBuildingMesh }; // kind -> (object) => Object3D
  const meshes = new Map(); // object id -> Object3D

  function add(obj) {
    const make = makers[obj.kind];
    if (!make) return;
    const mesh = make(obj);
    meshes.set(obj.id, mesh);
    parent.add(mesh);
  }
  function remove(obj) {
    const mesh = meshes.get(obj.id);
    if (!mesh) return;
    parent.remove(mesh); // shared geometry/materials: nothing to dispose
    meshes.delete(obj.id);
  }

  city.getObjects().forEach(add);
  city.subscribe((e) => {
    if (e.type === 'add') add(e.object);
    else if (e.type === 'remove') remove(e.object);
    else if (e.type === 'reset') {
      for (const mesh of meshes.values()) parent.remove(mesh);
      meshes.clear();
      e.objects.forEach(add);
    }
  });
}

function start() {
  const container = document.getElementById('app');
  const { renderer, scene, camera } = createScene(container);
  initControls(camera, renderer.domElement);
  initInput(renderer.domElement, camera);
  initUI(document.getElementById('ui'));

  const cityGroup = new THREE.Group();
  cityGroup.name = 'city';
  scene.add(cityGroup);
  syncCityMeshes(cityGroup);
  initPlacement(scene);

  renderer.setAnimationLoop(() => renderer.render(scene, camera));

  // Handle for poking at the game from the browser console.
  window.sapCity = { renderer, scene, camera, city };
}

try {
  start();
} catch (err) {
  console.error(err);
  document.getElementById('fallback').hidden = false;
}
