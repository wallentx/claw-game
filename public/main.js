import * as THREE from './libs/three.module.js';
import * as CANNON from './libs/cannon-es.js';

let scene, camera, renderer, clawGantry, clawBase, clawArms = [], clawMachine, prizes = [], cord;
let clawSpeed = 200; // Adjust speed to account for force application
let dropSpeed = 0.1;
let moveDirection = null;
const clawLimits = { x: [-4.375, 4.375], z: [-4.375, 4.375] };
const armLength = 1;
let grabButton;

// A constant for shifting the COM downward (for bottom-heavy behavior).
const comShift = 0.2;

let world, gantryBody, clawBody, prizeBodies = [], hangConstraint, cableLength = 1;
let initialCableLength = 0; // Store the initial cable length

// --- Helper function to create a cone shape as a ConvexPolyhedron ---
// The cone's tip is at (0, height/2, 0) and the base vertices are at (x, -height/2, z).
// Here we order the faces so that normals point outward.
function createConeShape(height, radius, numSegments) {
  const vertices = [];
  const faces = [];
  // Tip vertex.
  vertices.push(new CANNON.Vec3(0, height / 2, 0));
  // Bottom circle vertices at y = -height/2.
  for (let i = 0; i < numSegments; i++) {
    const theta = (2 * Math.PI * i) / numSegments;
    const x = radius * Math.cos(theta);
    const z = radius * Math.sin(theta);
    vertices.push(new CANNON.Vec3(x, -height / 2, z));
  }
  // Side faces: order vertices so normals point outward.
  for (let i = 1; i <= numSegments; i++) {
    const next = (i % numSegments) + 1;
    faces.push([0, next, i]); // reversed order to ensure CCW ordering
  }
  // Base face: reverse order.
  const baseFace = [];
  for (let i = 1; i <= numSegments; i++) {
    baseFace.push(i);
  }
  baseFace.reverse();
  faces.push(baseFace);

  return new CANNON.ConvexPolyhedron({ vertices, faces });
}

init();
animate();

function init() {
  // -------------------------
  // Physics World Setup
  // -------------------------
  world = new CANNON.World();
  world.gravity.set(0, -9.82, 0);
  world.broadphase = new CANNON.NaiveBroadphase();
  // Increase solver iterations for a stiffer constraint.
  world.solver.iterations = 20;

  // -------------------------
  // Scene Setup
  // -------------------------
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  // Camera
  camera = new THREE.PerspectiveCamera(
    75, window.innerWidth / window.innerHeight, 0.1, 1000
  );
  camera.position.set(0, 6, 15);
  camera.lookAt(new THREE.Vector3(0, 0, 0));

  // Renderer
  renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // -------------------------
  // Claw Machine (Outer Frame)
  // -------------------------
  let geometry = new THREE.BoxGeometry(8.75, 10, 8.75);
  let material = new THREE.MeshBasicMaterial({ color: 0xcccccc, wireframe: true });
  clawMachine = new THREE.Mesh(geometry, material);
  clawMachine.position.set(0, 0, 0);
  scene.add(clawMachine);

  // -------------------------
  // Claw Gantry
  // -------------------------
  geometry = new THREE.BoxGeometry(2.5, 0.25, 2.5);
  material = new THREE.MeshBasicMaterial({ color: 0xffa500 });
  clawGantry = new THREE.Mesh(geometry, material);
  clawGantry.position.set(0, 5, 0);
  scene.add(clawGantry);

  let gantryShape = new CANNON.Box(new CANNON.Vec3(1.25, 0.125, 1.25));
  gantryBody = new CANNON.Body({ mass: 300 });
  gantryBody.addShape(gantryShape);
  gantryBody.position.set(0, 5, 0);
  gantryBody.linearDamping = 0.3;
  gantryBody.linearFactor.set(1, 0, 1);
  gantryBody.angularFactor.set(0, 0, 0);
  world.addBody(gantryBody);

  // -------------------------
  // Compound Claw Body (Physics) as a Cone with Arms
  // -------------------------
  const coneHeight = 1;
  const coneRadius = 0.5;
  const numConeSegments = 16;
  const coneShape = createConeShape(coneHeight, coneRadius, numConeSegments);
  // Shift the cone so that its tip is at (0,0,0) and subtract comShift.
  clawBody = new CANNON.Body({ mass: 200 });
  clawBody.addShape(coneShape, new CANNON.Vec3(0, -coneHeight / 2 - comShift, 0));

  // Add three arms as cylinders.
  for (let i = 0; i < 3; i++) {
    const angle = (i * 2 * Math.PI) / 3;
    const offset = new CANNON.Vec3(
      coneRadius * Math.cos(angle),
      -coneHeight - armLength / 2 - comShift,
      coneRadius * Math.sin(angle)
    );
    const armShape = new CANNON.Cylinder(0.05, 0.05, armLength, 32);
    let armQuat = new CANNON.Quaternion();
    let defaultDir = new THREE.Vector3(0, -1, 0);
    let desiredDir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).normalize();
    let q = new THREE.Quaternion();
    q.setFromUnitVectors(defaultDir, desiredDir);
    armQuat.set(q.x, q.y, q.z, q.w);
    clawBody.addShape(armShape, offset, armQuat);
  }
  clawBody.position.set(0, 3, 0);
  // Optional: add extra damping to the claw for stability.
  clawBody.angularDamping = 0.5;
  clawBody.linearDamping = 0.1;
  world.addBody(clawBody);

  // -------------------------
  // Hang Constraint
  // -------------------------
  // Compute the initial cable length from the gantry's bottom-center to the claw tip.
  // For the gantry (a box of height 0.25), the bottom-center is 0.125 below its center.
  let gantryCableAttach = new THREE.Vector3(
    gantryBody.position.x,
    gantryBody.position.y - 0.125,
    gantryBody.position.z
  );
  // The cone tip is at the claw group's origin (we've translated the cone so its tip is at (0,0,0)).
  let clawTip = new THREE.Vector3().copy(clawBody.position); // because clawBase will match clawBody
  initialCableLength = gantryCableAttach.distanceTo(clawTip);
  cableLength = initialCableLength;
  hangConstraint = new CANNON.DistanceConstraint(gantryBody, clawBody, cableLength);
  world.addConstraint(hangConstraint);

  // -------------------------
  // Visual Claw (for rendering & animations)
  // -------------------------
  clawBase = new THREE.Group();
  let coneGeometry = new THREE.ConeGeometry(coneRadius, coneHeight, 32);
  // Translate so that the tip is at (0,0,0).
  coneGeometry.translate(0, -coneHeight / 2, 0);
  let coneMaterial = new THREE.MeshBasicMaterial({ color: 0x800080, wireframe: true });
  let coneMesh = new THREE.Mesh(coneGeometry, coneMaterial);
  clawBase.add(coneMesh);

  clawArms = [];
  for (let i = 0; i < 3; i++) {
    const angle = (i * 2 * Math.PI) / 3;
    let armGeometry = new THREE.CylinderGeometry(0.05, 0.05, armLength, 32);
    // Translate so that the arm's top is at (0,0,0).
    armGeometry.translate(0, -armLength / 2, 0);
    let armMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    let armMesh = new THREE.Mesh(armGeometry, armMaterial);

    let armGroup = new THREE.Group();
    // Set the group's position to the attachment point on the cone's base.
    armGroup.position.set(
      coneRadius * Math.cos(angle),
      -coneHeight,
      coneRadius * Math.sin(angle)
    );
    let defaultDirThree = new THREE.Vector3(0, -1, 0);
    let desiredDirThree = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).normalize();
    let qThree = new THREE.Quaternion();
    qThree.setFromUnitVectors(defaultDirThree, desiredDirThree);
    armGroup.quaternion.copy(qThree);

    armGroup.add(armMesh);
    clawBase.add(armGroup);
    clawArms.push(armGroup);
  }
  clawBase.position.copy(clawBody.position);
  scene.add(clawBase);

  // -------------------------
  // Cable / Spline
  // -------------------------
  // Draw the cable from the gantry's bottom-center to the claw tip.
  cord = drawSpline(gantryCableAttach, clawBase.position, 0x000000);
  scene.add(cord);

  // -------------------------
  // Prizes
  // -------------------------
  prizes = [];
  prizeBodies = [];
  for (let i = 0; i < 5; i++) {
    let size = Math.random() * 0.5 + 0.5;
    let prizeGeometry = new THREE.BoxGeometry(size, size, size);
    let prizeMaterial = new THREE.MeshBasicMaterial({ color: Math.random() * 0xffffff });
    let prize = new THREE.Mesh(prizeGeometry, prizeMaterial);
    prize.position.set(
      Math.random() * 7 - 3.5,
      0,
      Math.random() * 7 - 3.5
    );
    scene.add(prize);
    prizes.push(prize);

    let prizeShape = new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2));
    let prizeBody = new CANNON.Body({ mass: Math.random() + 0.1 });
    prizeBody.addShape(prizeShape);
    prizeBody.position.set(
      Math.random() * 7 - 3.5,
      0,
      Math.random() * 7 - 3.5
    );
    world.addBody(prizeBody);
    prizeBodies.push(prizeBody);
  }

  // -------------------------
  // Floor (Visual & Physics)
  // -------------------------
  const floorGeometry = new THREE.PlaneGeometry(8.75, 8.75);
  const floorMaterial = new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = Math.PI / 2;
  floor.position.y = -5;
  scene.add(floor);

  const floorShape = new CANNON.Plane();
  const floorBody = new CANNON.Body({ mass: 0 });
  floorBody.addShape(floorShape);
  floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  floorBody.position.set(0, -5, 0);
  world.addBody(floorBody);

  // -------------------------
  // Walls (Visual & Physics)
  // -------------------------
  const wallMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2 });
  const wallShapes = [
    new THREE.PlaneGeometry(8.75, 10),
    new THREE.PlaneGeometry(8.75, 10),
    new THREE.PlaneGeometry(8.75, 10),
    new THREE.PlaneGeometry(8.75, 10),
  ];
  const wallPositions = [
    { x: -4.375, y: 0, z: 0 },
    { x: 4.375, y: 0, z: 0 },
    { x: 0, y: 0, z: -4.375 },
    { x: 0, y: 0, z: 4.375 },
  ];
  const wallRotations = [
    { x: 0, y: Math.PI / 2, z: 0 },
    { x: 0, y: -Math.PI / 2, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 0, y: Math.PI, z: 0 },
  ];

  wallShapes.forEach((shape, index) => {
    const wallMesh = new THREE.Mesh(shape, wallMaterial);
    wallMesh.position.set(
      wallPositions[index].x,
      wallPositions[index].y,
      wallPositions[index].z
    );
    wallMesh.rotation.set(
      wallRotations[index].x,
      wallRotations[index].y,
      wallRotations[index].z
    );
    scene.add(wallMesh);

    const wallShape = new CANNON.Plane();
    const wallBody = new CANNON.Body({ mass: 0 });
    wallBody.addShape(wallShape);
    wallBody.position.set(
      wallPositions[index].x,
      wallPositions[index].y,
      wallPositions[index].z
    );
    wallBody.quaternion.setFromEuler(
      wallRotations[index].x,
      wallRotations[index].y,
      wallRotations[index].z
    );
    world.addBody(wallBody);
  });

  // -------------------------
  // UI Event Listeners
  // -------------------------
  const leftButton = document.getElementById('left');
  leftButton.addEventListener('mousedown', () => startMoving('left'));
  leftButton.addEventListener('mouseup', stopMoving);

  const rightButton = document.getElementById('right');
  rightButton.addEventListener('mousedown', () => startMoving('right'));
  rightButton.addEventListener('mouseup', stopMoving);

  const forwardButton = document.getElementById('forward');
  forwardButton.addEventListener('mousedown', () => startMoving('forward'));
  forwardButton.addEventListener('mouseup', stopMoving);

  const backwardButton = document.getElementById('backward');
  backwardButton.addEventListener('mousedown', () => startMoving('backward'));
  backwardButton.addEventListener('mouseup', stopMoving);

  grabButton = document.getElementById('drop');
  grabButton.addEventListener('click', () => dropClaw());

  window.addEventListener('mouseup', stopMoving);

  // Keyboard event listeners
  window.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowLeft':
        startMoving('left');
        break;
      case 'ArrowRight':
        startMoving('right');
        break;
      case 'ArrowUp':
        startMoving('forward');
        break;
      case 'ArrowDown':
        startMoving('backward');
        break;
      case ' ':
        dropClaw();
        break;
      default:
        break;
    }
  });

  window.addEventListener('keyup', (event) => {
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown':
        stopMoving();
        break;
      default:
        break;
    }
  });

  window.addEventListener('resize', onWindowResize, false);

  console.log('Camera position:', camera.position);
  console.log('Claw base position:', clawBase.position);
  console.log('Claw arms positions:', clawArms.map(arm => arm.position));
  console.log('Prizes positions:', prizes.map(prize => prize.position));
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  if (moveDirection) applyForceToGantry(moveDirection);

  world.step(1 / 60);

  clawGantry.position.copy(gantryBody.position);
  clawGantry.quaternion.copy(gantryBody.quaternion);

  clawBase.position.copy(clawBody.position);
  clawBase.quaternion.copy(clawBody.quaternion);

  let gantryCableAttach = new THREE.Vector3(
    gantryBody.position.x,
    gantryBody.position.y - 0.125,
    gantryBody.position.z
  );
  scene.remove(cord);
  cord = drawSpline(gantryCableAttach, clawBase.position, 0x000000);
  scene.add(cord);

  prizes.forEach((prize, index) => {
    prize.position.copy(prizeBodies[index].position);
    prize.quaternion.copy(prizeBodies[index].quaternion);
  });

  renderer.render(scene, camera);
}

function startMoving(direction) {
  console.log('Starting movement:', direction);
  moveDirection = direction;
}

function stopMoving() {
  console.log('Stopping movement');
  moveDirection = null;
}

function applyForceToGantry(direction) {
  const force = new CANNON.Vec3();
  switch (direction) {
    case 'left':
      if (gantryBody.position.x > clawLimits.x[0]) {
        force.set(-clawSpeed, 0, 0);
      }
      break;
    case 'right':
      if (gantryBody.position.x < clawLimits.x[1]) {
        force.set(clawSpeed, 0, 0);
      }
      break;
    case 'forward':
      if (gantryBody.position.z > clawLimits.z[0]) {
        force.set(0, 0, -clawSpeed);
      }
      break;
    case 'backward':
      if (gantryBody.position.z < clawLimits.z[1]) {
        force.set(0, 0, clawSpeed);
      }
      break;
  }
  gantryBody.applyForce(force, gantryBody.position);
}

function dropClaw() {
  if (!grabButton.disabled) {
    grabButton.disabled = true;
    openClaw();
    console.log('Dropping claw');
    let dropInterval = setInterval(() => {
      if (cableLength < 5) {
        cableLength += dropSpeed;
        hangConstraint.distance = cableLength;
      } else {
        clearInterval(dropInterval);
        closeClaw();
        setTimeout(() => {
          retractClaw();
        }, 500);
      }
    }, 50);
  }
}

function openClaw() {
  clawArms.forEach(armGroup => armGroup.rotation.z = Math.PI / 3);
}

function closeClaw() {
  clawArms.forEach(armGroup => armGroup.rotation.z = 0);
}

function retractClaw() {
  openClaw();
  let retractInterval = setInterval(() => {
    // Use the stored initialCableLength as the target instead of 1.
    if (cableLength > initialCableLength) {
      cableLength -= dropSpeed;
      hangConstraint.distance = cableLength;
    } else {
      clearInterval(retractInterval);
      closeClaw();
      grabButton.disabled = false;
    }
  }, 50);
}

function drawSpline(start, end, color) {
  let adjustedEnd = end.clone();
  let midVector = new THREE.Vector3(
    (start.x + adjustedEnd.x) / 2,
    (start.y + adjustedEnd.y) / 2 - 1,
    (start.z + adjustedEnd.z) / 2
  );
  let curve = new THREE.CatmullRomCurve3([start.clone(), midVector, adjustedEnd.clone()]);
  let points = curve.getPoints(20);
  let geometry = new THREE.BufferGeometry().setFromPoints(points);
  let material = new THREE.LineBasicMaterial({ color: color });
  let curveObject = new THREE.Line(geometry, material);
  return curveObject;
}