import * as THREE from './libs/three.module.js';
import * as CANNON from './libs/cannon-es.js';

let scene, camera, renderer, clawGantry, clawBase, clawMachine, prizes = [], cord, clawGroup;
let clawSpeed = 5; // Switched to velocity-based movement
let dropSpeed = 0.1;
let moveDirection = null;
const clawLimits = { x: [-4.375, 4.375], z: [-4.375, 4.375] };
let grabButton;

let world, gantryBody, clawBody, prizeBodies = [], hangConstraint, cableLength = 1;
let initialCableLength = 0;

// --- For the new functional claw ---
let armBodies = [];
let armMeshes = [];
let armConstraints = [];

// --- Helper function to create a cone shape for Cannon-es ---
function createConeShape(radius, height, numSegments) {
  const vertices = [new CANNON.Vec3(0, height / 2, 0)];
  const faces = [];
  for (let i = 0; i < numSegments; i++) {
    const angle = (i / numSegments) * 2 * Math.PI;
    vertices.push(new CANNON.Vec3(radius * Math.cos(angle), -height / 2, radius * Math.sin(angle)));
  }
  for (let i = 1; i <= numSegments; i++) {
    faces.push([0, i, i % numSegments + 1]);
  }
  const base = [];
  for (let i = 1; i <= numSegments; i++) base.push(i);
  faces.push(base.reverse());
  return new CANNON.ConvexPolyhedron({ vertices, faces });
}


init();
animate();

function init() {
  // -------------------------
  // Physics World Setup
  // -------------------------
  world = new CANNON.World();
  world.gravity.set(0, -25, 0); // Increased gravity
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 20;

  // -------------------------
  // Scene Setup
  // -------------------------
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111133); // Darker background

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 10, 7.5);
  scene.add(directionalLight);


  // Camera
  camera = new THREE.PerspectiveCamera(
    75, window.innerWidth / window.innerHeight, 0.1, 1000
  );
  camera.position.set(0, 6, 15);
  camera.lookAt(new THREE.Vector3(0, 0, 0));

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // -------------------------
  // Claw Machine (Outer Frame)
  // -------------------------
  let geometry = new THREE.BoxGeometry(8.75, 10, 8.75);
  // Using a standard material now, not wireframe
  let material = new THREE.MeshStandardMaterial({ color: 0xcccccc, transparent: true, opacity: 0.2 });
  clawMachine = new THREE.Mesh(geometry, material);
  clawMachine.position.set(0, 0, 0);
  scene.add(clawMachine);

  // -------------------------
  // Claw Gantry
  // -------------------------
  geometry = new THREE.BoxGeometry(2.5, 0.25, 2.5);
  material = new THREE.MeshStandardMaterial({ color: 0xffa500 });
  clawGantry = new THREE.Mesh(geometry, material);
  clawGantry.position.set(0, 5, 0);
  scene.add(clawGantry);

  let gantryShape = new CANNON.Box(new CANNON.Vec3(1.25, 0.125, 1.25));
  gantryBody = new CANNON.Body({ mass: 300 });
  gantryBody.addShape(gantryShape);
  gantryBody.position.set(0, 5, 0);
  gantryBody.linearDamping = 0.5; // A bit of damping helps with stopping
  gantryBody.linearFactor.set(1, 0, 1);
  gantryBody.angularFactor.set(0, 0, 0);
  world.addBody(gantryBody);

  // -------------------------
  // Claw Base (Physics) - NOW A BOTTOM-HEAVY CONE
  // -------------------------
  const baseRadius = 0.5;
  const baseHeight = 0.5;
  const clawBaseShape = createConeShape(baseRadius, baseHeight, 16);
  clawBody = new CANNON.Body({ mass: 150, linearDamping: 0.2, angularDamping: 0.5 });
  // Add the shape with an offset to lower the center of mass
  clawBody.addShape(clawBaseShape, new CANNON.Vec3(0, -baseHeight / 2, 0));
  clawBody.position.set(0, 3, 0);
  world.addBody(clawBody);

  // -------------------------
  // Claw Arms (Physics & Visuals) - REFACTORED
  // -------------------------
  const armLength = 1.5;
  const armWidth = 0.1;
  const fingerLength = 0.4;
  const comShift = 0.5; // How much to shift the center of mass down to make it bottom-heavy

  for (let i = 0; i < 3; i++) {
    const angle = (i * 2 * Math.PI) / 3;

    // --- Compound Physics Body for the Arm ---
    const armBody = new CANNON.Body({ mass: 25, angularDamping: 0.5 }); // Added angular damping

    // Main arm part
    const mainArmShape = new CANNON.Box(new CANNON.Vec3(armWidth / 2, armLength / 2, armWidth / 2));
    armBody.addShape(mainArmShape, new CANNON.Vec3(0, -armLength / 2 - comShift, 0)); // Shifted down

    // Finger part
    const fingerShape = new CANNON.Box(new CANNON.Vec3(fingerLength / 2, armWidth / 2, armWidth / 2));
    const fingerPosition = new CANNON.Vec3(fingerLength / 2, -armLength + (armWidth / 2) - comShift, 0); // Shifted down
    armBody.addShape(fingerShape, fingerPosition);

    // Position and orient the entire arm body
    const startX = baseRadius * Math.cos(angle);
    const startZ = baseRadius * Math.sin(angle);
    armBody.position.set(
      clawBody.position.x + startX,
      clawBody.position.y - baseHeight / 2,
      clawBody.position.z + startZ
    );
    const armQuaternion = new CANNON.Quaternion().setFromEuler(0, angle, 0);
    armBody.quaternion.copy(armQuaternion);

    world.addBody(armBody);
    armBodies.push(armBody);

    // --- Hinge Constraint with Limits ---
    const pivot = new CANNON.Vec3(0, 0, 0);
    // Position and orient the entire arm body
    const startX = baseRadius * Math.cos(angle);
    const startZ = baseRadius * Math.sin(angle);
    armBody.position.set(
      clawBody.position.x + startX,
      clawBody.position.y - baseHeight / 2,
      clawBody.position.z + startZ
    );
    // Start the arm in the "open" position
    const openAngle = Math.PI / 6;
    const armQuaternion = new CANNON.Quaternion().setFromEuler(0, angle, openAngle);
    armBody.quaternion.copy(armQuaternion);

    world.addBody(armBody);
    armBodies.push(armBody);

    // --- Hinge Constraint with Limits ---
    const pivot = new CANNON.Vec3(0, 0, 0);
    const axisA = new CANNON.Vec3(Math.sin(angle), 0, -Math.cos(angle));
    const axisB = new CANNON.Vec3(0, 0, 1);

    const constraint = new CANNON.HingeConstraint(clawBody, armBody, {
      pivotA: new CANNON.Vec3(startX, -baseHeight / 2, startZ),
      pivotB: pivot,
      axisA: axisA,
      axisB: axisB,
    });
    
    // Define the rotational limits for the hinge
    constraint.lowerLimit = -Math.PI / 8; // Closed position
    constraint.upperLimit = openAngle;  // Open position
    world.addConstraint(constraint);
    armConstraints.push(constraint);

    // --- Visual Arm Group ---
    const armMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const armGroup = new THREE.Group();
    // The visual group's rotation will be set in the animation loop, so we only need to build the shapes
    armGroup.quaternion.copy(armQuaternion); // Set initial visual rotation

    // Main arm mesh
    const mainArmGeometry = new THREE.BoxGeometry(armWidth, armLength, armWidth);
    const mainArmMesh = new THREE.Mesh(mainArmGeometry, armMaterial);
    mainArmMesh.position.set(0, -armLength / 2 - comShift, 0); // Shifted down
    armGroup.add(mainArmMesh);

    // Finger mesh
    const fingerGeometry = new THREE.BoxGeometry(fingerLength, armWidth, armWidth);
    const fingerMesh = new THREE.Mesh(fingerGeometry, armMaterial);
    fingerMesh.position.set(fingerLength / 2, -armLength + (armWidth / 2) - comShift, 0); // Shifted down
    armGroup.add(fingerMesh);
    
    scene.add(armGroup);
    armMeshes.push(armGroup);
  }


  // -------------------------
  // Visual Claw Base
  // -------------------------
  const clawBaseGeometry = new THREE.ConeGeometry(baseRadius, baseHeight, 16);
  const clawBaseMaterial = new THREE.MeshStandardMaterial({ color: 0x800080 });
  clawBase = new THREE.Mesh(clawBaseGeometry, clawBaseMaterial);
  // Apply the same offset as the physics shape so they align
  clawBase.position.y = -baseHeight / 2;
  
  // We'll create a group to hold the base and arms for easier syncing
  clawGroup = new THREE.Group();
  clawGroup.add(clawBase);
  scene.add(clawGroup);


  // -------------------------
  // Hang Constraint
  // -------------------------
  let gantryCableAttach = new THREE.Vector3().copy(gantryBody.position);
  let clawTip = new THREE.Vector3().copy(clawBody.position);
  initialCableLength = gantryCableAttach.distanceTo(clawTip);
  cableLength = initialCableLength;
  hangConstraint = new CANNON.DistanceConstraint(gantryBody, clawBody, cableLength);
  world.addConstraint(hangConstraint);


  // -------------------------
  // Cable / Spline
  // -------------------------
  cord = drawSpline(gantryBody.position, clawBody.position, 0xaaaaaa);
  scene.add(cord);

  // -------------------------
  // Prizes
  // -------------------------
  prizes = [];
  prizeBodies = [];
  for (let i = 0; i < 10; i++) { // More prizes
    let size = Math.random() * 0.4 + 0.4;
    let prizeGeometry = new THREE.BoxGeometry(size, size, size);
    let prizeMaterial = new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff });
    let prize = new THREE.Mesh(prizeGeometry, prizeMaterial);
    
    const prizeX = Math.random() * 7 - 3.5;
    const prizeZ = Math.random() * 7 - 3.5;
    prize.position.set(prizeX, -5 + size / 2, prizeZ);
    scene.add(prize);
    prizes.push(prize);

    let prizeShape = new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2));
    let prizeBody = new CANNON.Body({ mass: 5 }); // Give prizes some mass
    prizeBody.addShape(prizeShape);
    prizeBody.position.set(prizeX, -4.5 + size / 2, prizeZ); // Set the physics body position
    world.addBody(prizeBody);
    prizeBodies.push(prizeBody);
  }

  // -------------------------
  // Floor (Visual & Physics)
  // -------------------------
  const floorGeometry = new THREE.PlaneGeometry(8.75, 8.75);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, side: THREE.DoubleSide });
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

  // Walls (Physics only) - CORRECTED
  const wallMaterial = new CANNON.Material('wall');
  const wallPositions = [
      { pos: [4.375, 0, 0], quat: new CANNON.Quaternion().setFromEuler(0, -Math.PI / 2, 0) },
      { pos: [-4.375, 0, 0], quat: new CANNON.Quaternion().setFromEuler(0, Math.PI / 2, 0) },
      { pos: [0, 0, 4.375], quat: new CANNON.Quaternion().setFromEuler(0, Math.PI, 0) },
      { pos: [0, 0, -4.375], quat: new CANNON.Quaternion().setFromEuler(0, 0, 0) }
  ];

  wallPositions.forEach(data => {
      const wallBody = new CANNON.Body({ mass: 0, material: wallMaterial });
      wallBody.addShape(new CANNON.Plane());
      wallBody.position.set(...data.pos);
      wallBody.quaternion.copy(data.quat);
      world.addBody(wallBody);
  });


  // -------------------------
  // UI Event Listeners
  // -------------------------
  const leftButton = document.getElementById('left');
  const rightButton = document.getElementById('right');
  const forwardButton = document.getElementById('forward');
  const backwardButton = document.getElementById('backward');
  grabButton = document.getElementById('drop');

  // Mouse events
  leftButton.addEventListener('mousedown', () => startMoving('left'));
  leftButton.addEventListener('mouseup', stopMoving);
  rightButton.addEventListener('mousedown', () => startMoving('right'));
  rightButton.addEventListener('mouseup', stopMoving);
  forwardButton.addEventListener('mousedown', () => startMoving('forward'));
  forwardButton.addEventListener('mouseup', stopMoving);
  backwardButton.addEventListener('mousedown', () => startMoving('backward'));
  backwardButton.addEventListener('mouseup', stopMoving);

  // Touch events
  leftButton.addEventListener('touchstart', (e) => { e.preventDefault(); startMoving('left'); });
  leftButton.addEventListener('touchend', (e) => { e.preventDefault(); stopMoving(); });
  rightButton.addEventListener('touchstart', (e) => { e.preventDefault(); startMoving('right'); });
  rightButton.addEventListener('touchend', (e) => { e.preventDefault(); stopMoving(); });
  forwardButton.addEventListener('touchstart', (e) => { e.preventDefault(); startMoving('forward'); });
  forwardButton.addEventListener('touchend', (e) => { e.preventDefault(); stopMoving(); });
  backwardButton.addEventListener('touchstart', (e) => { e.preventDefault(); startMoving('backward'); });
  backwardButton.addEventListener('touchend', (e) => { e.preventDefault(); stopMoving(); });

  grabButton.addEventListener('click', () => dropClaw());
  grabButton.addEventListener('touchstart', (e) => { e.preventDefault(); dropClaw(); });

  window.addEventListener('mouseup', stopMoving);

  // Keyboard event listeners
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    switch (event.key) {
      case 'ArrowLeft': startMoving('left'); break;
      case 'ArrowRight': startMoving('right'); break;
      case 'ArrowUp': startMoving('forward'); break;
      case 'ArrowDown': startMoving('backward'); break;
      case ' ': dropClaw(); break;
    }
  });

  window.addEventListener('keyup', (event) => {
    switch (event.key) {
      case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown':
        stopMoving();
        break;
    }
  });

  window.addEventListener('resize', onWindowResize, false);

  const cameraSlider = document.getElementById('camera-slider');
  cameraSlider.addEventListener('input', () => {
    const angle = (cameraSlider.value / 360) * 2 * Math.PI;
    const radius = 15;
    camera.position.x = radius * Math.sin(angle);
    camera.position.z = radius * Math.cos(angle);
    camera.lookAt(new THREE.Vector3(0, 0, 0));
  });

  // Initialize Joystick for Mobile
  if (window.innerWidth <= 768) {
    const joystickContainer = document.getElementById('joystickContainer');
    const joystickManager = nipplejs.create({
      zone: joystickContainer,
      mode: 'static',
      position: { left: '50%', top: '50%' },
      color: 'white',
      size: 100,
    });
    joystickManager.on('move', (evt, data) => {
      if (data && data.vector) {
        const { x, y } = data.vector;
        if (Math.abs(x) > Math.abs(y)) {
          moveDirection = x > 0 ? 'right' : 'left';
        } else {
          moveDirection = y > 0 ? 'forward' : 'backward';
        }
      }
    });
    joystickManager.on('end', () => {
      stopMoving();
    });
  }
  openClaw(); // Start with the claw open
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  // New: Update gantry velocity in the animation loop for continuous movement
  if (moveDirection) moveGantry(moveDirection);

  world.step(1 / 60);

  // Update visuals to match physics
  clawGantry.position.copy(gantryBody.position);
  clawGantry.quaternion.copy(gantryBody.quaternion);

  clawGroup.position.copy(clawBody.position);
  clawGroup.quaternion.copy(clawBody.quaternion);

  // Update each arm
  for (let i = 0; i < armBodies.length; i++) {
    armMeshes[i].position.copy(armBodies[i].position);
    armMeshes[i].quaternion.copy(armBodies[i].quaternion);
  }

  scene.remove(cord);
  cord = drawSpline(gantryBody.position, clawBody.position, 0xaaaaaa);
  scene.add(cord);

  prizes.forEach((prize, index) => {
    prize.position.copy(prizeBodies[index].position);
    prize.quaternion.copy(prizeBodies[index].quaternion);
  });

  renderer.render(scene, camera);
}

function startMoving(direction) {
  moveDirection = direction;
}

function stopMoving() {
  moveDirection = null;
  // Instantly stop the gantry
  gantryBody.velocity.set(0, 0, 0);
}

function moveGantry(direction) {
  const velocity = new CANNON.Vec3();
  switch (direction) {
    case 'left':
      if (gantryBody.position.x > clawLimits.x[0]) velocity.set(-clawSpeed, 0, 0);
      break;
    case 'right':
      if (gantryBody.position.x < clawLimits.x[1]) velocity.set(clawSpeed, 0, 0);
      break;
    case 'forward':
      if (gantryBody.position.z > clawLimits.z[0]) velocity.set(0, 0, -clawSpeed);
      break;
    case 'backward':
      if (gantryBody.position.z < clawLimits.z[1]) velocity.set(0, 0, clawSpeed);
      break;
  }
  gantryBody.velocity.copy(velocity);
}

function dropClaw() {
  if (!grabButton.disabled) {
    grabButton.disabled = true;
    relaxClaw(); // Let arms dangle within limits on the way down
    let dropInterval = setInterval(() => {
      // INCREASED drop length
      if (cableLength < 8.5) {
        cableLength += dropSpeed;
        hangConstraint.distance = cableLength;
      } else {
        clearInterval(dropInterval);
        closeClaw(); // Grab at the bottom
        setTimeout(retractClaw, 1000); // Wait a bit before retracting
      }
    }, 50);
  }
}

function retractClaw() {
  let retractInterval = setInterval(() => {
    if (cableLength > initialCableLength) {
      cableLength -= dropSpeed * 2; // Retract faster
      hangConstraint.distance = cableLength;
    } else {
      clearInterval(retractInterval);
      openClaw(); // Open claw at the top, ready for next turn
      grabButton.disabled = false;
    }
  }, 50);
}

// --- NEW CLAW FUNCTIONS ---
function openClaw() {
  armConstraints.forEach(constraint => {
    constraint.enableMotor();
    constraint.setMotorSpeed( 0 ); // Hold position
    constraint.setMotorMaxForce( 200 ); // Use a moderate force to hold open
  });
}

function closeClaw() {
  armConstraints.forEach(constraint => {
    constraint.enableMotor();
    constraint.setMotorSpeed( -5 ); // Negative speed to close quickly
    constraint.setMotorMaxForce( 1000 ); // Strong grip
  });
}

function relaxClaw() {
    armConstraints.forEach(constraint => {
        constraint.enableMotor();
        constraint.setMotorSpeed(0); // Motor is on to enforce limits, but applies no force
        constraint.setMotorMaxForce(100); // A low force allows gravity/collisions to move the arm
    });
}


function drawSpline(start, end, color) {
  let curve = new THREE.LineCurve3(start, end);
  let points = curve.getPoints(20);
  let geometry = new THREE.BufferGeometry().setFromPoints(points);
  let material = new THREE.LineBasicMaterial({ color: color });
  let curveObject = new THREE.Line(geometry, material);
  return curveObject;
}
    const axisB = new CANNON.Vec3(0, 0, 1); // Hinge axis on the arm itself (local Z)

    const constraint = new CANNON.HingeConstraint(clawBody, armBody, {
      pivotA: new CANNON.Vec3(startX, -baseHeight / 2, startZ),
      pivotB: pivot,
      axisA: axisA,
      axisB: axisB,
    });
    
    // Define the rotational limits for the hinge
    constraint.lowerLimit = -Math.PI / 8; // Closed position
    constraint.upperLimit = Math.PI / 6;  // Open position
    world.addConstraint(constraint);
    armConstraints.push(constraint);

    // --- Visual Arm Group ---
    const armMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const armGroup = new THREE.Group();

    // Main arm mesh
    const mainArmGeometry = new THREE.BoxGeometry(armWidth, armLength, armWidth);
    const mainArmMesh = new THREE.Mesh(mainArmGeometry, armMaterial);
    mainArmMesh.position.set(0, -armLength / 2 - comShift, 0); // Shifted down
    armGroup.add(mainArmMesh);

    // Finger mesh
    const fingerGeometry = new THREE.BoxGeometry(fingerLength, armWidth, armWidth);
    const fingerMesh = new THREE.Mesh(fingerGeometry, armMaterial);
    fingerMesh.position.set(fingerLength / 2, -armLength + (armWidth / 2) - comShift, 0); // Shifted down
    armGroup.add(fingerMesh);
    
    scene.add(armGroup);
    armMeshes.push(armGroup);
  }


  // -------------------------
  // Visual Claw Base
  // -------------------------
  const clawBaseGeometry = new THREE.ConeGeometry(baseRadius, baseHeight, 16);
  const clawBaseMaterial = new THREE.MeshStandardMaterial({ color: 0x800080 });
  clawBase = new THREE.Mesh(clawBaseGeometry, clawBaseMaterial);
  // Apply the same offset as the physics shape so they align
  clawBase.position.y = -baseHeight / 2;
  
  // We'll create a group to hold the base and arms for easier syncing
  clawGroup = new THREE.Group();
  clawGroup.add(clawBase);
  scene.add(clawGroup);


  // -------------------------
  // Hang Constraint
  // -------------------------
  let gantryCableAttach = new THREE.Vector3().copy(gantryBody.position);
  let clawTip = new THREE.Vector3().copy(clawBody.position);
  initialCableLength = gantryCableAttach.distanceTo(clawTip);
  cableLength = initialCableLength;
  hangConstraint = new CANNON.DistanceConstraint(gantryBody, clawBody, cableLength);
  world.addConstraint(hangConstraint);


  // -------------------------
  // Cable / Spline
  // -------------------------
  cord = drawSpline(gantryBody.position, clawBody.position, 0xaaaaaa);
  scene.add(cord);

  // -------------------------
  // Prizes
  // -------------------------
  prizes = [];
  prizeBodies = [];
  for (let i = 0; i < 10; i++) { // More prizes
    let size = Math.random() * 0.4 + 0.4;
    let prizeGeometry = new THREE.BoxGeometry(size, size, size);
    let prizeMaterial = new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff });
    let prize = new THREE.Mesh(prizeGeometry, prizeMaterial);
    
    const prizeX = Math.random() * 7 - 3.5;
    const prizeZ = Math.random() * 7 - 3.5;
    prize.position.set(prizeX, -5 + size / 2, prizeZ);
    scene.add(prize);
    prizes.push(prize);

    let prizeShape = new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2));
    let prizeBody = new CANNON.Body({ mass: 5 }); // Give prizes some mass
    prizeBody.addShape(prizeShape);
    prizeBody.position.set(prizeX, -4.5 + size / 2, prizeZ); // Set the physics body position
    world.addBody(prizeBody);
    prizeBodies.push(prizeBody);
  }

  // -------------------------
  // Floor (Visual & Physics)
  // -------------------------
  const floorGeometry = new THREE.PlaneGeometry(8.75, 8.75);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, side: THREE.DoubleSide });
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

  // Walls (Physics only) - CORRECTED
  const wallMaterial = new CANNON.Material('wall');
  const wallPositions = [
      { pos: [4.375, 0, 0], quat: new CANNON.Quaternion().setFromEuler(0, -Math.PI / 2, 0) },
      { pos: [-4.375, 0, 0], quat: new CANNON.Quaternion().setFromEuler(0, Math.PI / 2, 0) },
      { pos: [0, 0, 4.375], quat: new CANNON.Quaternion().setFromEuler(0, Math.PI, 0) },
      { pos: [0, 0, -4.375], quat: new CANNON.Quaternion().setFromEuler(0, 0, 0) }
  ];

  wallPositions.forEach(data => {
      const wallBody = new CANNON.Body({ mass: 0, material: wallMaterial });
      wallBody.addShape(new CANNON.Plane());
      wallBody.position.set(...data.pos);
      wallBody.quaternion.copy(data.quat);
      world.addBody(wallBody);
  });


  // -------------------------
  // UI Event Listeners
  // -------------------------
  const leftButton = document.getElementById('left');
  const rightButton = document.getElementById('right');
  const forwardButton = document.getElementById('forward');
  const backwardButton = document.getElementById('backward');
  grabButton = document.getElementById('drop');

  // Mouse events
  leftButton.addEventListener('mousedown', () => startMoving('left'));
  leftButton.addEventListener('mouseup', stopMoving);
  rightButton.addEventListener('mousedown', () => startMoving('right'));
  rightButton.addEventListener('mouseup', stopMoving);
  forwardButton.addEventListener('mousedown', () => startMoving('forward'));
  forwardButton.addEventListener('mouseup', stopMoving);
  backwardButton.addEventListener('mousedown', () => startMoving('backward'));
  backwardButton.addEventListener('mouseup', stopMoving);

  // Touch events
  leftButton.addEventListener('touchstart', (e) => { e.preventDefault(); startMoving('left'); });
  leftButton.addEventListener('touchend', (e) => { e.preventDefault(); stopMoving(); });
  rightButton.addEventListener('touchstart', (e) => { e.preventDefault(); startMoving('right'); });
  rightButton.addEventListener('touchend', (e) => { e.preventDefault(); stopMoving(); });
  forwardButton.addEventListener('touchstart', (e) => { e.preventDefault(); startMoving('forward'); });
  forwardButton.addEventListener('touchend', (e) => { e.preventDefault(); stopMoving(); });
  backwardButton.addEventListener('touchstart', (e) => { e.preventDefault(); startMoving('backward'); });
  backwardButton.addEventListener('touchend', (e) => { e.preventDefault(); stopMoving(); });

  grabButton.addEventListener('click', () => dropClaw());
  grabButton.addEventListener('touchstart', (e) => { e.preventDefault(); dropClaw(); });

  window.addEventListener('mouseup', stopMoving);

  // Keyboard event listeners
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    switch (event.key) {
      case 'ArrowLeft': startMoving('left'); break;
      case 'ArrowRight': startMoving('right'); break;
      case 'ArrowUp': startMoving('forward'); break;
      case 'ArrowDown': startMoving('backward'); break;
      case ' ': dropClaw(); break;
    }
  });

  window.addEventListener('keyup', (event) => {
    switch (event.key) {
      case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown':
        stopMoving();
        break;
    }
  });

  window.addEventListener('resize', onWindowResize, false);

  const cameraSlider = document.getElementById('camera-slider');
  cameraSlider.addEventListener('input', () => {
    const angle = (cameraSlider.value / 360) * 2 * Math.PI;
    const radius = 15;
    camera.position.x = radius * Math.sin(angle);
    camera.position.z = radius * Math.cos(angle);
    camera.lookAt(new THREE.Vector3(0, 0, 0));
  });

  // Initialize Joystick for Mobile
  if (window.innerWidth <= 768) {
    const joystickContainer = document.getElementById('joystickContainer');
    const joystickManager = nipplejs.create({
      zone: joystickContainer,
      mode: 'static',
      position: { left: '50%', top: '50%' },
      color: 'white',
      size: 100,
    });
    joystickManager.on('move', (evt, data) => {
      if (data && data.vector) {
        const { x, y } = data.vector;
        if (Math.abs(x) > Math.abs(y)) {
          moveDirection = x > 0 ? 'right' : 'left';
        } else {
          moveDirection = y > 0 ? 'forward' : 'backward';
        }
      }
    });
    joystickManager.on('end', () => {
      stopMoving();
    });
  }
  openClaw(); // Start with the claw open
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  // New: Update gantry velocity in the animation loop for continuous movement
  if (moveDirection) moveGantry(moveDirection);

  world.step(1 / 60);

  // Update visuals to match physics
  clawGantry.position.copy(gantryBody.position);
  clawGantry.quaternion.copy(gantryBody.quaternion);

  clawGroup.position.copy(clawBody.position);
  clawGroup.quaternion.copy(clawBody.quaternion);

  // Update each arm
  for (let i = 0; i < armBodies.length; i++) {
    armMeshes[i].position.copy(armBodies[i].position);
    armMeshes[i].quaternion.copy(armBodies[i].quaternion);
  }

  scene.remove(cord);
  cord = drawSpline(gantryBody.position, clawBody.position, 0xaaaaaa);
  scene.add(cord);

  prizes.forEach((prize, index) => {
    prize.position.copy(prizeBodies[index].position);
    prize.quaternion.copy(prizeBodies[index].quaternion);
  });

  renderer.render(scene, camera);
}

function startMoving(direction) {
  moveDirection = direction;
}

function stopMoving() {
  moveDirection = null;
  // Instantly stop the gantry
  gantryBody.velocity.set(0, 0, 0);
}

function moveGantry(direction) {
  const velocity = new CANNON.Vec3();
  switch (direction) {
    case 'left':
      if (gantryBody.position.x > clawLimits.x[0]) velocity.set(-clawSpeed, 0, 0);
      break;
    case 'right':
      if (gantryBody.position.x < clawLimits.x[1]) velocity.set(clawSpeed, 0, 0);
      break;
    case 'forward':
      if (gantryBody.position.z > clawLimits.z[0]) velocity.set(0, 0, -clawSpeed);
      break;
    case 'backward':
      if (gantryBody.position.z < clawLimits.z[1]) velocity.set(0, 0, clawSpeed);
      break;
  }
  gantryBody.velocity.copy(velocity);
}

function dropClaw() {
  if (!grabButton.disabled) {
    grabButton.disabled = true;
    relaxClaw(); // Let arms dangle within limits on the way down
    let dropInterval = setInterval(() => {
      // INCREASED drop length
      if (cableLength < 8.5) {
        cableLength += dropSpeed;
        hangConstraint.distance = cableLength;
      } else {
        clearInterval(dropInterval);
        closeClaw(); // Grab at the bottom
        setTimeout(retractClaw, 1000); // Wait a bit before retracting
      }
    }, 50);
  }
}

function retractClaw() {
  let retractInterval = setInterval(() => {
    if (cableLength > initialCableLength) {
      cableLength -= dropSpeed * 2; // Retract faster
      hangConstraint.distance = cableLength;
    } else {
      clearInterval(retractInterval);
      openClaw(); // Open claw at the top, ready for next turn
      grabButton.disabled = false;
    }
  }, 50);
}

// --- NEW CLAW FUNCTIONS ---
function openClaw() {
  armConstraints.forEach(constraint => {
    constraint.enableMotor();
    constraint.setMotorSpeed( 5 ); // Positive speed to open quickly
    constraint.setMotorMaxForce( 500 ); 
  });
}

function closeClaw() {
  armConstraints.forEach(constraint => {
    constraint.enableMotor();
    constraint.setMotorSpeed( -5 ); // Negative speed to close quickly
    constraint.setMotorMaxForce( 1000 ); // Strong grip
  });
}

function relaxClaw() {
    armConstraints.forEach(constraint => {
        constraint.enableMotor();
        constraint.setMotorSpeed(0); // Motor is on to enforce limits, but applies no force
        constraint.setMotorMaxForce(100); // A low force allows gravity/collisions to move the arm
    });
}


function drawSpline(start, end, color) {
  let curve = new THREE.LineCurve3(start, end);
  let points = curve.getPoints(20);
  let geometry = new THREE.BufferGeometry().setFromPoints(points);
  let material = new THREE.LineBasicMaterial({ color: color });
  let curveObject = new THREE.Line(geometry, material);
  return curveObject;
}
