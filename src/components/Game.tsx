import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { GameEngine } from "../game/GameEngine";
import { GameUI } from "./GameUI";
import { toast } from "sonner";

interface GameProps {
  gameId: string;
  playerId: string;
  onLeaveGame: () => void;
}

export function Game({ gameId, playerId, onLeaveGame }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameEngineRef = useRef<GameEngine | null>(null);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0); // New state for loading progress
  
  const gameState = useQuery(api.game.getGameState, { gameId: gameId as Id<"games"> });
  const updatePosition = useMutation(api.game.updatePlayerPosition);
  const shootBullet = useMutation(api.game.shootBullet);
  const hitPlayer = useMutation(api.game.hitPlayer);
  const respawnPlayer = useMutation(api.game.respawnPlayer);

  const currentPlayer = gameState?.players.find(p => p._id === playerId);

  // Initialize game engine immediately when canvas is ready
  useEffect(() => {
    if (!canvasRef.current || gameEngineRef.current) return;

    let startTime = Date.now();
    console.log('Initializing game engine...');

    const canvas = canvasRef.current;
    
    // Create callbacks object for reuse
    const engineCallbacks = {
      onPositionUpdate: (position, rotation) => {
        updatePosition({
          playerId: playerId as Id<"players">,
          position,
          rotation,
        }).catch(err => console.error('Error updating position:', err));
      },
      onShoot: (startPosition, direction) => {
        shootBullet({
          playerId: playerId as Id<"players">,
          startPosition,
          direction,
        }).catch(err => console.error('Error shooting:', err));
      },
      onHit: (bulletId, victimId) => {
        hitPlayer({ 
          bulletId: bulletId as Id<"bullets">, 
          victimId: victimId as Id<"players"> 
        }).catch(err => console.error('Error hitting player:', err));
      },
      onProgress: (progress) => { // New callback for progress updates
        setLoadingProgress(progress);
      }
    };
    
    // Function to initialize the engine with fallback support
    const initializeEngine = (useSimplifiedVersion = false) => {
      try {
        // Create appropriate engine version
        const gameEngine = useSimplifiedVersion
          ? GameEngine.createSimplifiedEngine(canvas, engineCallbacks)
          : new GameEngine(canvas, engineCallbacks);
        
        gameEngine.setCurrentPlayerId(playerId);
        gameEngineRef.current = gameEngine;
        
        // Start with timeout detection
        const startTimeout = setTimeout(() => {
          console.warn('Game engine start is taking longer than expected...');
        }, 5000); // 5 second timeout warning
        
        // Start immediately - don't wait for game state
        gameEngine.start();
        clearTimeout(startTimeout);
        
        setIsEngineReady(true);
        setLoadingProgress(100); // Set to 100% when engine is ready
        console.log(`Game engine started successfully in ${Date.now() - startTime}ms${useSimplifiedVersion ? ' (simplified version)' : ''}`);
        return true;
      } catch (error) {
        // Check if we need to try the fallback
        if (!useSimplifiedVersion && error instanceof Error && error.message === 'ENGINE_NEEDS_FALLBACK') {
          console.warn('Attempting to use simplified engine fallback...');
          return initializeEngine(true); // Try with simplified version
        }
        
        console.error('Failed to start game engine:', error);
        alert(`Failed to start game engine: ${error instanceof Error ? error.message : 'Unknown error'}. Please check console for details.`);
        setIsEngineReady(true); // Still show UI even if engine fails
        return false;
      }
    };
    
    // Start initialization process
    initializeEngine();

    return () => {
      if (gameEngineRef.current) {
        console.log('Disposing game engine...');
        gameEngineRef.current.dispose();
        gameEngineRef.current = null;
      }
    };
  }, [canvasRef.current, playerId]);

  // Update game state when available
  useEffect(() => {
    if (gameEngineRef.current && gameState) {
      gameEngineRef.current.updateGameState(gameState);
    }
  }, [gameState]);

  const handleRespawn = async () => {
    if (!currentPlayer?.isAlive) {
      await respawnPlayer({ playerId: playerId as Id<"players"> });
      toast.success("Respawned!");
    }
  };

  const handleLeaveGame = () => {
    if (gameEngineRef.current) {
      gameEngineRef.current.dispose();
    }
    onLeaveGame();
  };

  // Show loading only briefly while engine initializes
  if (!isEngineReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-white text-lg">Starting game engine...</p>
          <div className="w-64 mx-auto mt-4 bg-gray-700 rounded-full h-2.5">
            <div 
              className="bg-blue-500 h-2.5 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${loadingProgress}%` }}
            ></div>
          </div>
          <p className="text-gray-400 text-sm mt-2">Loading: {loadingProgress.toFixed(0)}%</p>
          <p className="text-gray-400 text-sm mt-2">This may take a few moments. If it doesn't load, please check if your browser supports WebGL.</p>
          <div className="flex flex-col gap-2 mt-6">
          <button 
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            onClick={() => {
              // Run comprehensive WebGL diagnostics
              const runDiagnostics = () => {
                try {
                  // Check if WebGL is available
                  const canvas = document.createElement('canvas');
                  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                  
                  if (!gl) {
                    return {
                      supported: false,
                      message: 'WebGL is not supported by your browser. The game requires WebGL to run.',
                      troubleshooting: [
                        '- Try using a modern browser like Chrome, Firefox, or Edge',
                        '- Update your graphics drivers',
                        '- Enable hardware acceleration in your browser settings',
                        '- Disable browser extensions that might interfere with WebGL'
                      ]
                    };
                  }
                  
                  // Get detailed WebGL information
                  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                  const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'unknown';
                  const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown';
                  const version = gl.getParameter(gl.VERSION);
                  const shadingLanguageVersion = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
                  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
                  
                  // Check for potential issues
                  const issues = [];
                  
                  // Check for software rendering
                  if (renderer.toLowerCase().includes('swiftshader') || 
                      renderer.toLowerCase().includes('llvmpipe') || 
                      renderer.toLowerCase().includes('software')) {
                    issues.push('Using software rendering instead of hardware acceleration');
                  }
                  
                  // Check for outdated drivers
                  if (renderer.toLowerCase().includes('mesa') && !renderer.toLowerCase().includes('mesa 20')) {
                    issues.push('Potentially outdated graphics drivers');
                  }
                  
                  // Check for texture size limitations
                  if (maxTextureSize < 2048) {
                    issues.push('Limited texture size support');
                  }
                  
                  return {
                    supported: true,
                    vendor,
                    renderer,
                    version,
                    shadingLanguageVersion,
                    maxTextureSize,
                    issues,
                    troubleshooting: issues.length > 0 ? [
                      '- Update your graphics drivers',
                      '- Close other applications using 3D graphics',
                      '- Try a different browser',
                      '- Disable hardware acceleration if you see rendering artifacts'
                    ] : []
                  };
                } catch (e) {
                  return {
                    supported: false,
                    message: `Error checking WebGL support: ${e}`,
                    troubleshooting: [
                      '- Try refreshing the page',
                      '- Update your browser to the latest version',
                      '- Check if WebGL is enabled in your browser settings'
                    ]
                  };
                }
              };
              
              const result = runDiagnostics();
              
              // Format and display results
              let message = '';
              
              if (result.supported) {
                message = `WebGL is supported!\n\n`;
                message += `Vendor: ${result.vendor}\n`;
                message += `Renderer: ${result.renderer}\n`;
                message += `Version: ${result.version}\n`;
                message += `Shading Language: ${result.shadingLanguageVersion}\n`;
                message += `Max Texture Size: ${result.maxTextureSize}\n\n`;
                
                if (result.issues.length > 0) {
                  message += `Potential issues detected:\n- ${result.issues.join('\n- ')}\n\n`;
                  message += `Troubleshooting suggestions:\n${result.troubleshooting.join('\n')}\n\n`;
                  message += `These issues might be preventing the game engine from starting properly.`;
                } else {
                  message += `No WebGL issues detected. The problem might be elsewhere.\n`;
                  message += `Try refreshing the page or checking the browser console for errors.`;
                }
              } else {
                message = `${result.message}\n\n`;
                message += `Troubleshooting suggestions:\n${result.troubleshooting.join('\n')}`;
              }
              
              alert(message);
            }}
          >
            Run WebGL Diagnostics
          </button>
          
          <button 
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            onClick={() => {
              // Force set ready state to show UI even if engine fails
              setIsEngineReady(true);
              alert('Game engine may not have initialized properly. You might experience issues.');
            }}
          >
            Force Continue Anyway
          </button>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen bg-black">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-none"
        style={{ display: 'block' }}
      />
      
      {gameState && currentPlayer && (
        <GameUI
          gameState={gameState}
          currentPlayer={currentPlayer}
          onRespawn={handleRespawn}
          onLeaveGame={handleLeaveGame}
        />
      )}
      
      {currentPlayer && !currentPlayer.isAlive && (
        <div className="absolute inset-0 bg-red-900/50 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-4xl font-bold text-white mb-4">YOU DIED</h2>
            <button
              onClick={handleRespawn}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-lg transition-colors"
            >
              Respawn
            </button>
          </div>
        </div>
      )}
      
      <div className="absolute bottom-4 left-4 text-white text-sm">
        <p>WASD: Move | Mouse: Look | Click: Shoot | Shift: Sprint | Ctrl: Crouch | Space: Jump</p>
      </div>
      
      {!gameState && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2">
          <div className="bg-yellow-600/80 text-white px-4 py-2 rounded-lg">
            Connecting to game...
          </div>
        </div>
      )}
    </div>
  );
}
