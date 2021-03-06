window.focus(); // Capture keys right away (by default focus is on editor)

let camera, scene, renderer; // ThreeJS globals
let world; // CannonJs world
let skybox;
let dirLight;
let lastTime; // Last timestamp of animation
let stack; // Parts that stay solid on top of each other
let overhangs; // Overhanging parts that fall down
let boxHeight = 1; // Height of each layer
let originalBoxSize = 5; // Original width and height of a box
let originalBoxOffset = -10;
let autopilot;
let gameEnded;
let gameStarted;
let startTheGame = false;
let audioListener = new THREE.AudioListener();
let successSound, failSound, backgroundMusic;

let boxTexture;
let fogColor;

let externalMeshesData = {
  airplaneSpeed: 0.001,
  carSpeed: 0.001,
};
let externalMeshes = {
  airplane: null,
  boxBase: null,
  boxCover: null,
  boxRoof: null
};

// Orbit definitions
let enableOrbit;
let orbitAngle;
let orbitLength;
let orbitSpeed;
let robotPrecision; // Determines how precise the game is on autopilot

// Lerp definitions
let lerpRatio = 0.1;
let cameraPosition;
let cameraLookAtCurrent;
let cameraLookAtTarget;

init();

// Determines how precise the game is on autopilot
function setRobotPrecision() {
  robotPrecision = Math.random() * 1 - 0.5;
  robotPrecision = AUTOPILOT_ERROR || 0;
}

function Initialize(resetCamera = true) {
  boxHeight = TOWER_ORIGINAL_HEIGHT || 1; // Height of each layer
  originalBoxSize = TOWER_ORIGINAL_SIZE || 5; // Original width and height of a box
  originalBoxOffset = TOWER_ORIGINAL_OFFSET || -10;

  renderer.shadowMap.enabled = ENABLE_SHADOW || false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  dirLight.castShadow = ENABLE_SHADOW || false;

  if (ENABLE_BACKGROUND_MUSIC || false) {
    if (backgroundMusic == undefined) {
      backgroundMusic = new THREE.Audio( audioListener );
      playAudio(backgroundMusic, 'assets/audio/ES_Deep%20Down%20Diamond%20Alley%20-%20Josef%20Bel%20Habib.mp3', true);
    }
  }

  lastTime = 0;
  stack = [];
  overhangs = [];
  setRobotPrecision();

   if (resetCamera) {
    enableOrbit = true;
    orbitAngle = 45;
    orbitLength = 10;
    orbitHeight = 10;
    orbitSpeed = -0.05;

    camera.position.set(20, 20, 20);
    camera.lookAt(0, 0, 0);

    cameraPosition = [20, 20, 20];
    cameraLookAtCurrent = [0, 0, 0];
    cameraLookAtTarget = [0, 0, 0];
   }

  addLayer(0, 0, originalBoxSize, originalBoxSize);
  addLayer(-10, 0, originalBoxSize, originalBoxSize, "x");
  
  createBoxBase();
  createBoxRoof();

  if (externalMeshes.sky !== undefined) {
    externalMeshes.sky.material.opacity = 0;
  }

  fogColor = new THREE.Color(0xAAAAAA);
  if (ENABLE_FOG) {
    scene.fog = new THREE.FogExp2(fogColor, 0.016);
  } else {
    scene.fog = undefined;
  }

  const floor = new CANNON.Body({ 
    mass: 0, 
    shape:  new CANNON.Box(new CANNON.Vec3(100, 1, 100))
  });
  floor.position.y -= 1;
  world.add(floor);
}

function init() {
  autopilot = ENABLE_AUTOPILOT || false;
  gameStarted = false;
  gameEnded = false;

  boxTexture = new THREE.TextureLoader().load('assets/images/bernard-hermant-CqIXtyyrNVg-unsplash.jpg');

  // Initialize CannonJS
  world = new CANNON.World();
  world.gravity.set(0, -10, 0); // Gravity pulls things down
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 40;

  // Initialize ThreeJs
  const aspect = window.innerWidth / window.innerHeight;
  const width = 200;
  const height = width / aspect;

  if (IS_ORTHOGRAPHIC || false) {
    camera = new THREE.OrthographicCamera(
      width / -2, // left
      width / 2, // right
      height / 2, // top
      height / -2, // bottom
      0, // near plane
      200 // far plane
    );
  } else {
    camera = new THREE.PerspectiveCamera(
      45, // field of view
      aspect, // aspect ratio
      1, // near plane
      1200 // far plane
    );
  }

  successSound = new THREE.Audio( audioListener );
  failSound = new THREE.Audio( audioListener );
  scene = new THREE.Scene();

  // Set up lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight.position.set(10, 20, 0);
  dirLight.castShadow = true;
  // dirLight.shadow.mapSize.width = 2048;
  // dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.1;
  dirLight.shadow.camera.far = 500;
  dirLight.shadow.camera.left = -50;
  dirLight.shadow.camera.right = 50;
  dirLight.shadow.camera.top = 50;
  dirLight.shadow.camera.bottom = -50;
  scene.add(dirLight);

  // Set up renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animation);
  document.body.appendChild(renderer.domElement);

  Initialize();
  loadExternalAssets();

  cameraOrbitController();
}

function playAudio(whichSound, soundpath, isLoop) {
  const audioLoader = new THREE.AudioLoader();
  audioLoader.load( soundpath, function( buffer ) {
    whichSound.setBuffer( buffer );
    whichSound.setLoop( isLoop );
    whichSound.setVolume( 0.5 );
    whichSound.play();
  });
}

function startGame() {
  if (backgroundMusic) {
    if (backgroundMusic.volume > 0) {
      backgroundMusic.setVolume(backgroundMusic.volume - 0.002);
    } else {
      backgroundMusic.setVolume(0);
    }
  }
  autopilot = ENABLE_AUTOPILOT || false;
  
  gameEnded = false;
  lastTime = 0;

  stack = [];
  overhangs = [];

  if (world) {
    // Remove every object from world
    while (world.bodies.length > 0) {
      world.remove(world.bodies[0]);
    }
  }

  if (scene) {
    // while (scene.children.find((c) => c.type == "Mesh")) {
    //   const mesh = scene.children.find((c) => c.type == "Mesh");
    //   scene.remove(mesh);
    // }

    // while (scene.children.find((c) => c.type == "Group")) {
    //   const mesh = scene.children.find((c) => c.type == "Group");
    //   scene.remove(mesh);
    // }

    while (scene.children.find((c) => c.userData.group == 'main')) {
      const mesh = scene.children.find((c) => c.userData.group == 'main');
      scene.remove(mesh);
    }

    Initialize();
  }  
}

function addLayer(x, z, width, depth, direction) {
  const y = boxHeight * stack.length; // Add the new box one layer higher
  const layer = generateBox(x, y, z, width, depth, false);
  layer.direction = direction;
  stack.push(layer);
}

function addOverhang(x, z, width, depth) {
  const y = boxHeight * (stack.length - 1); // Add the new box one the same layer
  const overhang = generateBox(x, y, z, width, depth, true);
  overhangs.push(overhang);
}

function generateBox(x, y, z, width, depth, falls) {
  // ThreeJS
  const geometry = new THREE.BoxGeometry(width, boxHeight, depth);
  // const color = new THREE.Color(`hsl(${30 + stack.length * 4}, 100%, 50%)`);
  const color = new THREE.Color(`hsl(${30 + stack.length * 4}, 100%, 70%)`);
  const material = new THREE.MeshLambertMaterial({ color, map: boxTexture });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.userData.group = 'main';
  mesh.castShadow = ENABLE_SHADOW || false;
  mesh.receiveShadow = ENABLE_SHADOW || false;
  scene.add(mesh);

  // CannonJS
  const shape = new CANNON.Box(
    new CANNON.Vec3(width / 2, boxHeight / 2, depth / 2)
  );
  let mass = falls ? 5 : 0; // If it shouldn't fall then setting the mass to zero will keep it stationary
  mass *= width / originalBoxSize; // Reduce mass proportionately by size
  mass *= depth / originalBoxSize; // Reduce mass proportionately by size
  const body = new CANNON.Body({ mass, shape });
  body.position.set(x, y, z);
  world.addBody(body);

  return {
    threejs: mesh,
    cannonjs: body,
    width,
    depth
  };
}

function cutBox(topLayer, overlap, size, delta) {
  const direction = topLayer.direction;
  const newWidth = direction == "x" ? overlap : topLayer.width;
  const newDepth = direction == "z" ? overlap : topLayer.depth;

  // Update metadata
  topLayer.width = newWidth;
  topLayer.depth = newDepth;

  // Update ThreeJS model
  topLayer.threejs.scale[direction] = overlap / size;
  topLayer.threejs.position[direction] -= delta / 2;

  // Update CannonJS model
  topLayer.cannonjs.position[direction] -= delta / 2;

  // Replace shape to a smaller one (in CannonJS you can't simply just scale a shape)
  const shape = new CANNON.Box(
    new CANNON.Vec3(newWidth / 2, boxHeight / 2, newDepth / 2)
  );
  topLayer.cannonjs.shapes = [];
  topLayer.cannonjs.addShape(shape);
}

// start using button only
document.getElementById("start").addEventListener("click", function(event) {
  event.preventDefault();
  eventHandler();
  startTheGame = true;
  return;
});

document.getElementById("results").addEventListener("click", function(event) {
  event.preventDefault();
  hideResult();
  startGame();
  return;
});

window.addEventListener("mousedown", eventHandler);
window.addEventListener("touchends", eventHandler);
window.addEventListener("keydown", function (event) {
  if (event.key == " ") {
    event.preventDefault();
    eventHandler();
    startTheGame = true;
    return;
  }
  if (event.key == "R" || event.key == "r") {
    event.preventDefault();
    hideResult();
    startGame();
    return;
  }
});

function eventHandler() {
  if (gameStarted) {
    // if (autopilot) startGame();
    // else splitBlockAndAddNextOneIfOverlaps();
    splitBlockAndAddNextOneIfOverlaps();
  } else {
    if (!startTheGame) {
      gameStarted = true;
      hideMainMenu();
      startGame();
    }
  }
}

function splitBlockAndAddNextOneIfOverlaps() {
  if (gameEnded) return;

  const topLayer = stack[stack.length - 1];
  const previousLayer = stack[stack.length - 2];

  const direction = topLayer.direction;

  const size = direction == "x" ? topLayer.width : topLayer.depth;
  const delta =
    topLayer.threejs.position[direction] -
    previousLayer.threejs.position[direction];
  const overhangSize = Math.abs(delta);
  const overlap = size - overhangSize;

  if (overlap > 0) {
    cutBox(topLayer, overlap, size, delta);

    // Overhang
    const overhangShift = (overlap / 2 + overhangSize / 2) * Math.sign(delta);
    const overhangX =
      direction == "x"
        ? topLayer.threejs.position.x + overhangShift
        : topLayer.threejs.position.x;
    const overhangZ =
      direction == "z"
        ? topLayer.threejs.position.z + overhangShift
        : topLayer.threejs.position.z;
    const overhangWidth = direction == "x" ? overhangSize : topLayer.width;
    const overhangDepth = direction == "z" ? overhangSize : topLayer.depth;

    addOverhang(overhangX, overhangZ, overhangWidth, overhangDepth);

    // Next layer
    const offset = originalBoxOffset;
    const sign = (stack.length + 1) % 4 < 2 ? -1 : 1;
    const nextX = direction == "x" ? topLayer.threejs.position.x : offset * sign;
    const nextZ = direction == "z" ? topLayer.threejs.position.z : offset * sign;
    
    const newWidth = topLayer.width; // New layer has the same size as the cut top layer
    const newDepth = topLayer.depth; // New layer has the same size as the cut top layer
    const nextDirection = direction == "x" ? "z" : "x";

    console.log(stack[stack.length - 1].threejs.position.y);

    if (scoreElement) scoreElement.innerText = stack.length - 1;
    addLayer(nextX, nextZ, newWidth, newDepth, nextDirection);
    playAudio(successSound,'assets/audio/476178__unadamlar__correct-choice.wav',false);
  } else {
    missedTheSpot();
  }

  createBoxCover();
  createBoxRoof();
}

function missedTheSpot() {
  if (backgroundMusic) {
    if (backgroundMusic.volume < 0.1) {
      backgroundMusic.setVolume(backgroundMusic.volume + 0.002);
    } else {
      backgroundMusic.setVolume(0.1);
    }
  }
  const topLayer = stack[stack.length - 1];

  // Turn to top layer into an overhang and let it fall down
  addOverhang(
    topLayer.threejs.position.x,
    topLayer.threejs.position.z,
    topLayer.width,
    topLayer.depth
  );
  world.remove(topLayer.cannonjs);
  scene.remove(topLayer.threejs);

  if(failSound && failSound.isPlaying) {
    failSound.stop();
  }
  playAudio(failSound,'assets/audio/527491__hipstertypist__error-sound.ogg',false);
  
  gameEnded = true;
  showResult(stack.length - 2);
}

function animation(time) {
  if (gameStarted) {
    if (lastTime) {
      const timePassed = time - lastTime;
      const speed = TOWER_ORIGINAL_SPEED || 0.008;

      const topLayer = stack[stack.length - 1];
      const previousLayer = stack[stack.length - 2];

      // The top level box should move if the game has not ended AND
      // it's either NOT in autopilot or it is in autopilot and the box did not yet reach the robot position
      let sign = stack.length % 4 < 2 ? -1 : 1;

      const boxShouldMove =
        !gameEnded &&
        (!autopilot ||
          (autopilot &&
            (sign > 0 && topLayer.threejs.position[topLayer.direction] <
            previousLayer.threejs.position[topLayer.direction] +
            robotPrecision)
            ||
            (sign < 0 && topLayer.threejs.position[topLayer.direction] >
            previousLayer.threejs.position[topLayer.direction] -
            robotPrecision)
            ));

      if (boxShouldMove) {
        // Keep the position visible on UI and the position in the model in sync
        topLayer.threejs.position[topLayer.direction] += speed * timePassed * sign;
        topLayer.cannonjs.position[topLayer.direction] += speed * timePassed * sign;

        // If the box went beyond the stack then show up the fail screen
        if (sign > 0 && topLayer.threejs.position[topLayer.direction] > 11
        || sign < 0 && topLayer.threejs.position[topLayer.direction] < -11) {
          missedTheSpot();
        }
      } else {
        // If it shouldn't move then is it because the autopilot reached the correct position?
        // Because if so then next level is coming
        if (autopilot) {
          splitBlockAndAddNextOneIfOverlaps();
          setRobotPrecision();
        }
      }

      updatePhysics(timePassed);

      updateExternalAssets(timePassed);
      cameraOrbitController();
      fogFadeController();
    }

    lastTime = time;
  }


  renderer.render(scene, camera);
}

function updatePhysics(timePassed) {
  world.step(timePassed / 1000); // Step the physics world

  let lifetime = 10000;
  world.bodies.forEach((el) => {
    if (el.lifetime == undefined) {
      el.lifetime = lifetime;
    }
    el.lifetime -= timePassed;
    if (el.lifetime < 0) {
      world.remove(el);
    }
  });
  
  // Copy coordinates from Cannon.js to Three.js
  overhangs.forEach((element) => {
    element.threejs.position.copy(element.cannonjs.position);
    element.threejs.quaternion.copy(element.cannonjs.quaternion);
  });
}

function cameraOrbitController() {
  // Camera orbit movement
  if (enableOrbit) {
    orbitAngle += orbitSpeed + (stack.length > 35 ? orbitSpeed * 1 : 0);
    const heightRatio = 0.5;
    cameraPosition = [
      Math.cos(orbitAngle / 180 * Math.PI) * orbitLength,
      orbitHeight + stack.length * boxHeight * heightRatio + (stack.length > 34 ? stack.length : 0) * 0.4 
              + 
              (stack.length >= 35
                ? ((stack.length < 45 
                    ? (stack.length - 35) 
                    : (45 - 35)) * -1)
                : 0)
            ,
      Math.sin(orbitAngle / 180 * Math.PI) * orbitLength
    ];
    if (PLACEMENT_MODE) {
      camera.position.set(0, PLACEMENT_MODE_HEIGHT || 120, 0);
    }
    cameraLookAtTarget = [0, stack[stack.length - 1].threejs.position.y, 0];
    cameraLookAtCurrent = [
      lerp(cameraLookAtCurrent[0], cameraLookAtTarget[0], lerpRatio * 2),
      lerp(cameraLookAtCurrent[1], cameraLookAtTarget[1], lerpRatio * 2),
      lerp(cameraLookAtCurrent[2], cameraLookAtTarget[2], lerpRatio * 2)
    ];
    camera.position.set(
      lerp(camera.position.x, cameraPosition[0], lerpRatio),
      lerp(camera.position.y, cameraPosition[1], lerpRatio),
      lerp(camera.position.z, cameraPosition[2], lerpRatio)
    );
    camera.lookAt(...cameraLookAtCurrent);
  }
}

function fogFadeController() {
  if (ENABLE_FOG || false) {
    if (stack.length > 35) {
      let x = scene.fog.density;
      let limit = 0;
      if (scene.fog !== undefined && x > limit) {
        x -= 0.00006;
      } else {
        x = limit;
      }

      scene.fog.density = x;
    }
  }
}

window.addEventListener("resize", () => {
  // Adjust camera
  console.log("resize", window.innerWidth, window.innerHeight);
  const aspect = window.innerWidth / window.innerHeight;
  const width = 10;
  const height = width / aspect;

  camera.top = height / 2;
  camera.bottom = height / -2;

  // Reset renderer
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.render(scene, camera);
});

onUpdateGraphicSettings = Initialize;
updateGraphicSettings();
loadMeshBatch();