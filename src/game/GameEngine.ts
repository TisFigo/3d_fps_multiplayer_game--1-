import * as THREE from 'three';

interface GameCallbacks {
  onPositionUpdate: (position: { x: number; y: number; z: number }, rotation: { x: number; y: number }) => void;
  onShoot: (startPosition: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }) => void;
  onHit: (bulletId: string, victimId: string) => void;
}

export interface GameEngineCallbacks {
  onPositionUpdate: (position: Vector3, rotation: Quaternion) => void;
  onShoot: (startPosition: Vector3, direction: Vector3) => void;
  onHit: (bulletId: Id<"bullets">, victimId: Id<"players">) => void;
  onProgress: (progress: number) => void; // New callback for loading progress
}

export class GameEngine {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private canvas: HTMLCanvasElement;
  private callbacks: GameCallbacks;
  private currentPlayerId: string = '';
  
  private player: {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    rotation: { x: number; y: number };
    isGrounded: boolean;
    isSprinting: boolean;
    isCrouching: boolean;
    height: number;
  } = {
    position: new THREE.Vector3(0, 1.8, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    rotation: { x: 0, y: 0 },
    isGrounded: true,
    isSprinting: false,
    isCrouching: false,
    height: 1.8,
  };
  
  private controls: {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    jump: boolean;
    sprint: boolean;
    crouch: boolean;
  } = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
    crouch: false,
  };
  
  private mouse: {
    x: number;
    y: number;
    sensitivity: number;
  } = {
    x: 0,
    y: 0,
    sensitivity: 0.002,
  };
  
  private gameObjects: Map<string, THREE.Object3D> = new Map();
  private bullets: Map<string, { mesh: THREE.Mesh; velocity: THREE.Vector3; startTime: number }> = new Map();
  private players: Map<string, { mesh: THREE.Mesh; nameTag: THREE.Sprite }> = new Map();
  
  private clock: THREE.Clock;
  private isRunning: boolean = false;
  private lastUpdateTime: number = 0;
  
  // Bound event handlers
  private boundOnKeyDown: (e: KeyboardEvent) => void;
  private boundOnKeyUp: (e: KeyboardEvent) => void;
  private boundRequestPointerLock: () => void;
  private boundOnPointerLockChange: () => void;
  private boundOnMouseMove: (e: MouseEvent) => void;
  private boundOnMouseDown: (e: MouseEvent) => void;
  private boundOnResize: () => void;
  
  // Reusable geometries and materials for better performance
  private static bulletGeometry: THREE.SphereGeometry;
  private static bulletMaterial: THREE.MeshBasicMaterial;
  private static playerGeometry: THREE.CapsuleGeometry;
  private static wallMaterial: THREE.MeshLambertMaterial;
  
  // Helper method to detect WebGL capabilities
  private static detectWebGLCapabilities(): { supported: boolean; info: string } {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      
      if (!gl) {
        return { supported: false, info: 'WebGL not supported by this browser' };
      }
      
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      let vendor = 'unknown';
      let renderer = 'unknown';
      
      if (debugInfo) {
        vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'unknown';
        renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'unknown';
      }
      
      const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      const maxViewportDims = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      
      return {
        supported: true,
        info: `WebGL supported - Vendor: ${vendor}, Renderer: ${renderer}, ` +
              `Max Texture Size: ${maxTextureSize}, ` +
              `Max Viewport Dims: ${maxViewportDims ? maxViewportDims[0] + 'x' + maxViewportDims[1] : 'unknown'}`
      };
    } catch (e) {
      return { supported: false, info: `WebGL detection error: ${e}` };
    }
  }
  
  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.clock = new THREE.Clock();

    // Check WebGL capabilities before initialization
    const webGLCapabilities = GameEngine.detectWebGLCapabilities();
    console.log('WebGL capabilities:', webGLCapabilities);

    console.log('GameEngine constructor called');
    this.callbacks.onProgress(0); // Initial progress

    try {
      // Initialize static geometries and materials once
      if (!GameEngine.bulletGeometry) {
        GameEngine.bulletGeometry = new THREE.SphereGeometry(0.02, 6, 6); // Reduced detail
        GameEngine.bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        GameEngine.playerGeometry = new THREE.CapsuleGeometry(0.3, 1.5, 4, 8);
        GameEngine.wallMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
      }

      // Initialize Three.js scene and camera
      this.scene = new THREE.Scene();
      const aspect = (canvas.clientWidth || window.innerWidth) / (canvas.clientHeight || window.innerHeight);
      this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);

      // Check for WebGL support and create appropriate renderer
      if (!THREE.WebGLRenderer.isWebGLAvailable()) {
        console.warn('WebGL is not supported by your browser, attempting to use fallback renderer');

        // Check if CanvasRenderer is available (you would need to include it separately)
        if (typeof THREE.CanvasRenderer === 'function') {
          console.log('Using CanvasRenderer as fallback');
          // @ts-ignore - CanvasRenderer is not in the default types
          this.renderer = new THREE.CanvasRenderer({ canvas });
        } else {
          // No fallback available
          throw new Error('WebGL is not supported by your browser and no fallback renderer is available');
        }
      } else {
        // Create WebGL renderer with error handling and performance options
        console.log('Using WebGLRenderer');
        this.renderer = new THREE.WebGLRenderer({ 
          canvas, 
          antialias: false, // Disable for better performance
          powerPreference: "high-performance",
          precision: "mediump", // Use medium precision for better performance
          failIfMajorPerformanceCaveat: false // Don't fail if the system performance would be poor
        });
      }
      
      this.setupRenderer();
      this.callbacks.onProgress(20); // Progress after renderer setup
      this.setupScene();
      this.callbacks.onProgress(40); // Progress after scene setup
      this.setupPlayer();
      this.callbacks.onProgress(60); // Progress after player setup
      this.setupEventListeners();
      this.callbacks.onProgress(80); // Progress after event listeners
      
      console.log('GameEngine initialized successfully');
      this.callbacks.onProgress(100); // Final progress when initialization is complete
    } catch (error) {
      console.error('Error initializing game engine:', error);
      throw error;
    }
  }
  
  private setupRenderer() {
    try {
      const width = this.canvas.clientWidth || window.innerWidth;
      const height = this.canvas.clientHeight || window.innerHeight;
      
      // Check if device is likely mobile or low-end
      const isMobileOrLowEnd = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                              window.innerWidth < 768 || 
                              (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
      
      // Adjust settings based on device capability
      this.renderer.setSize(width, height, false); // false prevents setting canvas style
      this.renderer.setClearColor(0x87CEEB); // Sky blue
      
      // Reduce quality on mobile/low-end devices
      if (isMobileOrLowEnd) {
        console.log('Detected mobile or low-end device, reducing graphics quality');
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
        this.renderer.shadowMap.enabled = false;
      } else {
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.BasicShadowMap; // Faster shadow type
      }
      
      console.log('Renderer setup complete:', { 
        width, 
        height, 
        pixelRatio: this.renderer.getPixelRatio(),
        shadowsEnabled: this.renderer.shadowMap.enabled
      });
      // Initial progress update
      this.callbacks.onProgress(0);
    } catch (error) {
      console.error('Error setting up renderer:', error);
      throw error;
    }
  }
  
  private setupScene() {
    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 50, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024; // Reduced shadow map size
    directionalLight.shadow.mapSize.height = 1024;
    this.scene.add(directionalLight);
    
    // Ground
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x90EE90 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    
    // Walls and obstacles
    this.createMap();
  }
  
  private createMap() {
    // Boundary walls
    const walls = [
      { pos: [0, 2.5, 50], size: [100, 5, 1] },
      { pos: [0, 2.5, -50], size: [100, 5, 1] },
      { pos: [50, 2.5, 0], size: [1, 5, 100] },
      { pos: [-50, 2.5, 0], size: [1, 5, 100] },
    ];
    
    walls.forEach(wall => {
      const geometry = new THREE.BoxGeometry(wall.size[0], wall.size[1], wall.size[2]);
      const mesh = new THREE.Mesh(geometry, GameEngine.wallMaterial);
      mesh.position.set(wall.pos[0], wall.pos[1], wall.pos[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    });
    
    // Cover objects
    const covers = [
      { pos: [10, 1, 10], size: [4, 2, 4] },
      { pos: [-10, 1, 10], size: [4, 2, 4] },
      { pos: [10, 1, -10], size: [4, 2, 4] },
      { pos: [-10, 1, -10], size: [4, 2, 4] },
      { pos: [0, 1, 20], size: [8, 2, 2] },
      { pos: [0, 1, -20], size: [8, 2, 2] },
      { pos: [20, 1, 0], size: [2, 2, 8] },
      { pos: [-20, 1, 0], size: [2, 2, 8] },
    ];
    
    covers.forEach(cover => {
      const geometry = new THREE.BoxGeometry(cover.size[0], cover.size[1], cover.size[2]);
      const mesh = new THREE.Mesh(geometry, GameEngine.wallMaterial);
      mesh.position.set(cover.pos[0], cover.pos[1], cover.pos[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    });
  }
  
  private setupPlayer() {
    // Ensure player object is properly initialized
    if (!this.player) {
      this.player = {
        position: new THREE.Vector3(0, 1.8, 0),
        velocity: new THREE.Vector3(0, 0, 0),
        rotation: { x: 0, y: 0 },
        isGrounded: true,
        isSprinting: false,
        isCrouching: false,
        height: 1.8,
      };
    }
    
    // Set camera position to match player position
    this.camera.position.copy(this.player.position);
    console.log('Player setup complete');
  }
  
  private setupEventListeners() {
    // Bind event handlers to this instance
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnKeyUp = this.onKeyUp.bind(this);
    this.boundRequestPointerLock = this.requestPointerLock.bind(this);
    this.boundOnPointerLockChange = this.onPointerLockChange.bind(this);
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnResize = this.onResize.bind(this);
    
    // Keyboard events
    document.addEventListener('keydown', this.boundOnKeyDown);
    document.addEventListener('keyup', this.boundOnKeyUp);
    
    // Mouse events
    this.canvas.addEventListener('click', this.boundRequestPointerLock);
    document.addEventListener('pointerlockchange', this.boundOnPointerLockChange);
    document.addEventListener('mousemove', this.boundOnMouseMove);
    document.addEventListener('mousedown', this.boundOnMouseDown);
    
    // Resize
    window.addEventListener('resize', this.boundOnResize);
  }
  
  private onKeyDown(event: KeyboardEvent) {
    switch (event.code) {
      case 'KeyW': this.controls.forward = true; break;
      case 'KeyS': this.controls.backward = true; break;
      case 'KeyA': this.controls.left = true; break;
      case 'KeyD': this.controls.right = true; break;
      case 'Space': this.controls.jump = true; event.preventDefault(); break;
      case 'ShiftLeft': this.controls.sprint = true; break;
      case 'ControlLeft': this.controls.crouch = true; break;
    }
  }
  
  private onKeyUp(event: KeyboardEvent) {
    switch (event.code) {
      case 'KeyW': this.controls.forward = false; break;
      case 'KeyS': this.controls.backward = false; break;
      case 'KeyA': this.controls.left = false; break;
      case 'KeyD': this.controls.right = false; break;
      case 'Space': this.controls.jump = false; break;
      case 'ShiftLeft': this.controls.sprint = false; break;
      case 'ControlLeft': this.controls.crouch = false; break;
    }
  }
  
  private requestPointerLock() {
    this.canvas.requestPointerLock();
  }
  
  private onPointerLockChange() {
    // Handle pointer lock state changes
  }
  
  private onMouseMove(event: MouseEvent) {
    if (document.pointerLockElement === this.canvas) {
      this.mouse.x += event.movementX * this.mouse.sensitivity;
      this.mouse.y += event.movementY * this.mouse.sensitivity;
      
      // Clamp vertical rotation
      this.mouse.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.mouse.y));
      
      this.player.rotation.x = this.mouse.y;
      this.player.rotation.y = this.mouse.x;
    }
  }
  
  private onMouseDown(event: MouseEvent) {
    if (document.pointerLockElement === this.canvas && event.button === 0) {
      this.shoot();
    }
  }
  
  private onResize() {
    this.camera.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
  }
  
  private shoot() {
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(this.camera.quaternion);
    
    const startPosition = this.player.position.clone();
    startPosition.y += 0.1; // Slightly above player center
    
    this.callbacks.onShoot(
      { x: startPosition.x, y: startPosition.y, z: startPosition.z },
      { x: direction.x, y: direction.y, z: direction.z }
    );
    
    // Create muzzle flash effect
    this.createMuzzleFlash();
  }
  
  private createMuzzleFlash() {
    const flashGeometry = new THREE.SphereGeometry(0.1, 6, 6); // Reduced detail
    const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    
    const flashPosition = this.player.position.clone();
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(this.camera.quaternion);
    flashPosition.add(direction.multiplyScalar(0.5));
    
    flash.position.copy(flashPosition);
    this.scene.add(flash);
    
    setTimeout(() => {
      this.scene.remove(flash);
      flashGeometry.dispose();
      flashMaterial.dispose();
    }, 50);
  }
  
  private updatePlayer(deltaTime: number) {
    // Handle crouching
    const targetHeight = this.controls.crouch ? 1.2 : 1.8;
    this.player.height = THREE.MathUtils.lerp(this.player.height, targetHeight, deltaTime * 10);
    
    // Movement
    const moveSpeed = this.controls.sprint ? 8 : 5;
    const direction = new THREE.Vector3();
    
    if (this.controls.forward) direction.z -= 1;
    if (this.controls.backward) direction.z += 1;
    if (this.controls.left) direction.x -= 1;
    if (this.controls.right) direction.x += 1;
    
    if (direction.length() > 0) {
      direction.normalize();
      direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.player.rotation.y);
      
      this.player.velocity.x = direction.x * moveSpeed;
      this.player.velocity.z = direction.z * moveSpeed;
    } else {
      this.player.velocity.x *= 0.8;
      this.player.velocity.z *= 0.8;
    }
    
    // Jumping
    if (this.controls.jump && this.player.isGrounded) {
      this.player.velocity.y = 8;
      this.player.isGrounded = false;
    }
    
    // Gravity
    if (!this.player.isGrounded) {
      this.player.velocity.y -= 25 * deltaTime;
    }
    
    // Update position
    this.player.position.add(this.player.velocity.clone().multiplyScalar(deltaTime));
    
    // Ground collision
    if (this.player.position.y <= this.player.height / 2) {
      this.player.position.y = this.player.height / 2;
      this.player.velocity.y = 0;
      this.player.isGrounded = true;
    }
    
    // Boundary collision
    this.player.position.x = Math.max(-49, Math.min(49, this.player.position.x));
    this.player.position.z = Math.max(-49, Math.min(49, this.player.position.z));
    
    // Update camera
    this.camera.position.copy(this.player.position);
    this.camera.rotation.x = this.player.rotation.x;
    this.camera.rotation.y = this.player.rotation.y;
    
    // Send position update (throttled)
    const now = Date.now();
    if (now - this.lastUpdateTime > 50) { // 20 FPS updates
      this.callbacks.onPositionUpdate(
        { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z },
        { x: this.player.rotation.x, y: this.player.rotation.y }
      );
      this.lastUpdateTime = now;
    }
  }
  
  private updateBullets(deltaTime: number) {
    const bulletsToRemove: string[] = [];
    
    this.bullets.forEach((bullet, id) => {
      bullet.mesh.position.add(bullet.velocity.clone().multiplyScalar(deltaTime));
      
      // Remove old bullets
      if (Date.now() - bullet.startTime > 5000) {
        bulletsToRemove.push(id);
      }
      
      // Check for collisions with walls (simple bounds check)
      if (Math.abs(bullet.mesh.position.x) > 50 || 
          Math.abs(bullet.mesh.position.z) > 50 ||
          bullet.mesh.position.y < 0 || 
          bullet.mesh.position.y > 10) {
        bulletsToRemove.push(id);
      }
      
      // Check for collisions with other players
      this.players.forEach((playerObj, playerId) => {
        // Skip if it's the current player's bullet hitting themselves
        if (playerId === this.currentPlayerId) return;
        
        const playerPosition = playerObj.mesh.position;
        const bulletPosition = bullet.mesh.position;
        
        // Simple distance-based collision detection
        const distance = bulletPosition.distanceTo(playerPosition);
        if (distance < 0.5) { // Collision threshold
          // Call the hit callback
          this.callbacks.onHit(id, playerId);
          bulletsToRemove.push(id);
        }
      });
    });
    
    bulletsToRemove.forEach(id => {
      const bullet = this.bullets.get(id);
      if (bullet) {
        this.scene.remove(bullet.mesh);
        this.bullets.delete(id);
      }
    });
  }
  
  public updateGameState(gameState: any) {
    if (!gameState) return;
    
    // Update other players
    gameState.players?.forEach((player: any) => {
      if (player._id === this.currentPlayerId) return;
      
      let playerMesh = this.players.get(player._id)?.mesh;
      let nameTag = this.players.get(player._id)?.nameTag;
      
      if (!playerMesh) {
        // Create player mesh using shared geometry
        const material = new THREE.MeshLambertMaterial({ 
          color: player.isAlive ? 0x0066ff : 0x666666 
        });
        playerMesh = new THREE.Mesh(GameEngine.playerGeometry, material);
        playerMesh.castShadow = true;
        this.scene.add(playerMesh);
        
        // Create name tag (optimized)
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;
        canvas.width = 128; // Reduced size
        canvas.height = 32;
        context.fillStyle = 'rgba(0, 0, 0, 0.8)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = 'white';
        context.font = '16px Arial';
        context.textAlign = 'center';
        context.fillText(player.username, canvas.width / 2, 20);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        nameTag = new THREE.Sprite(spriteMaterial);
        nameTag.scale.set(1, 0.25, 1);
        this.scene.add(nameTag);
        
        this.players.set(player._id, { mesh: playerMesh, nameTag });
      }
      
      // Update position
      playerMesh.position.set(player.position.x, player.position.y, player.position.z);
      if (nameTag) {
        nameTag.position.set(player.position.x, player.position.y + 1.5, player.position.z);
      }
      
      // Update material based on alive status
      (playerMesh.material as THREE.MeshLambertMaterial).color.setHex(
        player.isAlive ? 0x0066ff : 0x666666
      );
    });
    
    // Remove disconnected players
    this.players.forEach((playerObj, id) => {
      if (!gameState.players?.find((p: any) => p._id === id)) {
        this.scene.remove(playerObj.mesh);
        this.scene.remove(playerObj.nameTag);
        this.players.delete(id);
      }
    });
    
    // Update bullets using shared geometry
    gameState.bullets?.forEach((bullet: any) => {
      if (!this.bullets.has(bullet._id)) {
        const mesh = new THREE.Mesh(GameEngine.bulletGeometry, GameEngine.bulletMaterial);
        
        mesh.position.set(
          bullet.startPosition.x,
          bullet.startPosition.y,
          bullet.startPosition.z
        );
        
        const velocity = new THREE.Vector3(
          bullet.direction.x * bullet.speed,
          bullet.direction.y * bullet.speed,
          bullet.direction.z * bullet.speed
        );
        
        this.scene.add(mesh);
        this.bullets.set(bullet._id, {
          mesh,
          velocity,
          startTime: bullet.timestamp,
        });
      }
    });
  }
  
  public setCurrentPlayerId(playerId: string) {
    this.currentPlayerId = playerId;
  }
  
  /**
   * Creates a simplified version of the game engine with minimal features
   * This can be used as a fallback when the full engine fails to initialize
   */
  public static createSimplifiedEngine(canvas: HTMLCanvasElement, callbacks: GameCallbacks): GameEngine {
    console.log('Creating simplified game engine...');
    
    try {
      // Create a new engine instance
      const engine = new GameEngine(canvas, callbacks);
      
      // Override complex methods with simplified versions
      engine.setupScene = function() {
        // Simplified scene setup with minimal lighting and no shadows
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(ambientLight);
        
        // Simple ground
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x90EE90 });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        this.scene.add(ground);
        
        console.log('Simplified scene setup complete');
      };
      
      // Simplified renderer setup
      engine.setupRenderer = function() {
        const width = this.canvas.clientWidth || window.innerWidth;
        const height = this.canvas.clientHeight || window.innerHeight;
        
        this.renderer.setSize(width, height, false);
        this.renderer.setClearColor(0x87CEEB);
        this.renderer.shadowMap.enabled = false;
        
        console.log('Simplified renderer setup complete');
      };
      
      // Simplified update methods
      engine.updateBullets = function() { /* Minimal implementation */ };
      engine.updateGameState = function() { /* Minimal implementation */ };
      
      return engine;
    } catch (error) {
      console.error('Failed to create simplified engine:', error);
      throw error;
    }
  }
  
  public start() {
    try {
      console.log('Starting game engine...');
      this.isRunning = true;
      this.lastUpdateTime = Date.now();
      this.animate();
      console.log('Game engine started successfully');
    } catch (error) {
      console.error('Failed to start game engine:', error);
      this.isRunning = false;
      
      // Try to recover with simplified engine
      try {
        console.warn('Attempting to start simplified engine as fallback...');
        // We can't directly replace this instance, but we can notify the caller
        throw new Error('ENGINE_NEEDS_FALLBACK');
      } catch (fallbackError) {
        throw error; // Re-throw the original error if fallback also fails
      }
    }
  }
  
  public dispose() {
    this.isRunning = false;
    
    // Clean up Three.js objects
    this.scene.clear();
    this.renderer.dispose();
    
    // Clean up event listeners
    document.removeEventListener('keydown', this.boundOnKeyDown);
    document.removeEventListener('keyup', this.boundOnKeyUp);
    this.canvas.removeEventListener('click', this.boundRequestPointerLock);
    document.removeEventListener('pointerlockchange', this.boundOnPointerLockChange);
    document.removeEventListener('mousemove', this.boundOnMouseMove);
    document.removeEventListener('mousedown', this.boundOnMouseDown);
    window.removeEventListener('resize', this.boundOnResize);
  }
  
  private animate = () => {
    if (!this.isRunning) return;
    
    try {
      requestAnimationFrame(this.animate);
      
      const deltaTime = this.clock.getDelta();
      const startTime = performance.now();
      
      this.updatePlayer(deltaTime);
      this.updateBullets(deltaTime);
      
      this.renderer.render(this.scene, this.camera);
      
      // Monitor performance
      const frameTime = performance.now() - startTime;
      if (frameTime > 50) { // Log slow frames (over 50ms)
        console.warn(`Slow frame detected: ${frameTime.toFixed(2)}ms`);
      }
    } catch (error) {
      console.error('Error in animation loop:', error);
      this.isRunning = false;
    }
  };
}
