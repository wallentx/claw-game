import * as THREE from './libs/three.module.js';
import * as CANNON from './libs/cannon-es.js';

let scene, camera, renderer, clawGantry, clawBase, clawArms = [], clawMachine, prizes = [], cord;
let clawSpeed = 70;
let dropSpeed = 0.1;
let moveDirection = null;
let grabButton;

let world, gantryBody, clawBody, prizeBodies = [], hangConstraint, cableLength = 1;

init();
animate();

function init() {
    world = new CANNON.World();
    world.gravity.set(0, -9.82, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 10;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 6, 15);
    camera.lookAt(new THREE.Vector3(0, 0, 0));

    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    let geometry = new THREE.BoxGeometry(8.75, 10, 8.75);
    let material = new THREE.MeshBasicMaterial({ color: 0xcccccc, wireframe: true });
    clawMachine = new THREE.Mesh(geometry, material);
    scene.add(clawMachine);

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

    geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
    material = new THREE.MeshBasicMaterial({ color: 0x800080 });
    clawBase = new THREE.Mesh(geometry, material);
    clawBase.rotation.x = Math.PI / 2;
    clawBase.position.set(0, 3, 0);
    scene.add(clawBase);

    let clawShape = new CANNON.Cylinder(0.5, 0.5, 1, 32);
    clawBody = new CANNON.Body({ mass: 200 });
    clawBody.addShape(clawShape);
    clawBody.position.set(0, 2.5, 0);
    world.addBody(clawBody);

    hangConstraint = new CANNON.DistanceConstraint(gantryBody, clawBody, cableLength);
    world.addConstraint(hangConstraint);

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

    // Touch events for mobile (prevent duplicate events by calling preventDefault)
    leftButton.addEventListener('touchstart', (e) => { e.preventDefault(); startMoving('left'); });
    leftButton.addEventListener('touchend', (e) => { e.preventDefault(); stopMoving(); });

    rightButton.addEventListener('touchstart', (e) => { e.preventDefault(); startMoving('right'); });
    rightButton.addEventListener('touchend', (e) => { e.preventDefault(); stopMoving(); });

    forwardButton.addEventListener('touchstart', (e) => { e.preventDefault(); startMoving('forward'); });
    forwardButton.addEventListener('touchend', (e) => { e.preventDefault(); stopMoving(); });

    backwardButton.addEventListener('touchstart', (e) => { e.preventDefault(); startMoving('backward'); });
    backwardButton.addEventListener('touchend', (e) => { e.preventDefault(); stopMoving(); });

    // Grab button (works for both mouse and touch)
    grabButton.addEventListener('click', () => dropClaw());
    grabButton.addEventListener('touchstart', (e) => { e.preventDefault(); dropClaw(); });

    window.addEventListener('mouseup', stopMoving);

    // Keyboard event listeners remain as-is:
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

    // -------------------------
    // Initialize Joystick for Mobile
    // -------------------------
    // (For example, only enable the joystick if the viewport width is less than 768px)
    if (window.innerWidth <= 768) {
      const joystickContainer = document.getElementById('joystickContainer');
      // Create the joystick in static mode at the center of the container.
      const joystickManager = nipplejs.create({
        zone: joystickContainer,
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: 'blue',
        size: 100,
      });

      joystickManager.on('move', (evt, data) => {
        if (data && data.vector) {
          // Use the vector to choose one direction:
          // Compare the absolute x and y components to choose horizontal or vertical movement.
          const { x, y } = data.vector;
          if (Math.abs(x) > Math.abs(y)) {
            if (x > 0) {
              startMoving('right');
            } else {
              startMoving('left');
            }
          } else {
            if (y > 0) {
              startMoving('backward');
            } else {
              startMoving('forward');
            }
          }
        }
      });

      joystickManager.on('end', () => {
        stopMoving();
      });
    }
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
    clawBase.position.copy(clawBody.position);

    renderer.render(scene, camera);
}

function startMoving(direction) {
    moveDirection = direction;
}

function stopMoving() {
    moveDirection = null;
}

function applyForceToGantry(direction) {
    const force = new CANNON.Vec3();
    switch (direction) {
        case 'left': force.set(-clawSpeed, 0, 0); break;
        case 'right': force.set(clawSpeed, 0, 0); break;
        case 'forward': force.set(0, 0, -clawSpeed); break;
        case 'backward': force.set(0, 0, clawSpeed); break;
    }
    gantryBody.applyForce(force, gantryBody.position);
}

function dropClaw() {
    if (!grabButton.disabled) {
        grabButton.disabled = true;
        let dropInterval = setInterval(() => {
            if (cableLength < 5) {
                cableLength += dropSpeed;
                hangConstraint.distance = cableLength;
            } else {
                clearInterval(dropInterval);
                setTimeout(retractClaw, 500);
            }
        }, 50);
    }
}

function retractClaw() {
    let retractInterval = setInterval(() => {
        if (cableLength > 1) {
            cableLength -= dropSpeed;
            hangConstraint.distance = cableLength;
        } else {
            clearInterval(retractInterval);
            grabButton.disabled = false;
        }
    }, 50);
}
