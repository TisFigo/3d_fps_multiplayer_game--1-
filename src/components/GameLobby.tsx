import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";

interface GameLobbyProps {
  onJoinGame: (gameId: string, playerId: string) => void;
}

export function GameLobby({ onJoinGame }: GameLobbyProps) {
  const [username, setUsername] = useState("");
  const [showCreateGame, setShowCreateGame] = useState(false);
  const [gameName, setGameName] = useState("");
  
  const games = useQuery(api.game.listGames);
  const createGame = useMutation(api.game.createGame);
  const joinGame = useMutation(api.game.joinGame);

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gameName.trim() || !username.trim()) {
      toast.error("Please enter both game name and username");
      return;
    }

    try {
      const gameId = await createGame({
        name: gameName,
        maxPlayers: 8,
        mapName: "arena",
      });
      
      const playerId = await joinGame({
        gameId: gameId as Id<"games">,
        username: username.trim(),
      });
      
      onJoinGame(gameId, playerId);
      toast.success("Game created and joined!");
    } catch (error) {
      toast.error("Failed to create game");
      console.error(error);
    }
  };

  const handleJoinGame = async (gameId: string) => {
    if (!username.trim()) {
      toast.error("Please enter a username");
      return;
    }

    try {
      const playerId = await joinGame({
        gameId: gameId as Id<"games">,
        username: username.trim(),
      });
      
      onJoinGame(gameId, playerId);
      toast.success("Joined game!");
    } catch (error) {
      toast.error("Failed to join game");
      console.error(error);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-blue-400 mb-2">Game Lobby</h1>
          <p className="text-gray-300">Choose a game to join or create your own</p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
            maxLength={20}
          />
        </div>

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-white">Available Games</h2>
          <button
            onClick={() => setShowCreateGame(!showCreateGame)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            {showCreateGame ? "Cancel" : "Create Game"}
          </button>
        </div>

        {showCreateGame && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h3 className="text-xl font-semibold text-white mb-4">Create New Game</h3>
            <form onSubmit={handleCreateGame} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Game Name
                </label>
                <input
                  type="text"
                  value={gameName}
                  onChange={(e) => setGameName(e.target.value)}
                  placeholder="Enter game name"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
              >
                Create & Join Game
              </button>
            </form>
          </div>
        )}

        <div className="grid gap-4">
          {games?.map((game) => (
            <div
              key={game._id}
              className="bg-gray-800 rounded-lg p-6 border border-gray-700"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-semibold text-white">{game.name}</h3>
                  <p className="text-gray-400">
                    Players: {game.currentPlayers}/{game.maxPlayers} • Map: {game.mapName}
                  </p>
                  <p className="text-sm text-gray-500 capitalize">Status: {game.status}</p>
                </div>
                <button
                  onClick={() => handleJoinGame(game._id)}
                  disabled={game.currentPlayers >= game.maxPlayers || !username.trim()}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                >
                  {game.currentPlayers >= game.maxPlayers ? "Full" : "Join"}
                </button>
              </div>
            </div>
          ))}
          
          {games?.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400 text-lg">No games available</p>
              <p className="text-gray-500">Create the first game to get started!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
