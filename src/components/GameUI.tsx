interface GameUIProps {
  gameState: any;
  currentPlayer: any;
  onRespawn: () => void;
  onLeaveGame: () => void;
}

export function GameUI({ gameState, currentPlayer, onRespawn, onLeaveGame }: GameUIProps) {
  if (!gameState || !currentPlayer) return null;

  const sortedPlayers = [...gameState.players].sort((a, b) => b.kills - a.kills);

  return (
    <>
      {/* Health Bar */}
      <div className="absolute top-4 left-4">
        <div className="bg-black/50 rounded-lg p-3">
          <div className="text-white text-sm mb-1">Health</div>
          <div className="w-48 h-4 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-red-500 to-green-500 transition-all duration-300"
              style={{ width: `${(currentPlayer.health / currentPlayer.maxHealth) * 100}%` }}
            />
          </div>
          <div className="text-white text-xs mt-1">
            {currentPlayer.health}/{currentPlayer.maxHealth}
          </div>
        </div>
      </div>

      {/* Crosshair */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
        <div className="w-4 h-4 border-2 border-white rounded-full opacity-75"></div>
      </div>

      {/* Scoreboard */}
      <div className="absolute top-4 right-4">
        <div className="bg-black/70 rounded-lg p-4 min-w-64">
          <h3 className="text-white font-bold mb-3 text-center">Scoreboard</h3>
          <div className="space-y-2">
            {sortedPlayers.map((player, index) => (
              <div
                key={player._id}
                className={`flex justify-between items-center text-sm ${
                  player._id === currentPlayer._id ? 'text-yellow-400' : 'text-white'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-gray-400">#{index + 1}</span>
                  <span>{player.username}</span>
                  {!player.isAlive && <span className="text-red-400">💀</span>}
                </span>
                <span>{player.kills}/{player.deaths}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Kill Feed */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2">
        <div className="bg-black/50 rounded-lg p-3 min-w-80">
          <div className="space-y-1">
            {gameState.recentKills.slice(0, 5).map((kill: any) => (
              <div key={kill._id} className="text-white text-sm text-center">
                <span className="text-blue-400">{kill.killerName}</span>
                <span className="mx-2 text-gray-400">eliminated</span>
                <span className="text-red-400">{kill.victimName}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Game Stats */}
      <div className="absolute bottom-4 right-4">
        <div className="bg-black/50 rounded-lg p-3">
          <div className="text-white text-sm space-y-1">
            <div>K/D: {currentPlayer.kills}/{currentPlayer.deaths}</div>
            <div>Players: {gameState.players.length}</div>
            <div>Alive: {gameState.players.filter((p: any) => p.isAlive).length}</div>
          </div>
        </div>
      </div>

      {/* Leave Game Button */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 translate-y-20">
        <button
          onClick={onLeaveGame}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
        >
          Leave Game
        </button>
      </div>
    </>
  );
}
