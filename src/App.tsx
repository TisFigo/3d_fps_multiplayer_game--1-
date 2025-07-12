import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster } from "sonner";
import { GameLobby } from "./components/GameLobby";
import { Game } from "./components/Game";
import { useState } from "react";

export default function App() {
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  return (
    <div className="min-h-screen flex flex-col bg-gray-900 text-white">
      <header className="sticky top-0 z-10 bg-gray-800/80 backdrop-blur-sm h-16 flex justify-between items-center border-b border-gray-700 shadow-sm px-4">
        <h2 className="text-xl font-bold text-blue-400">FPS Arena</h2>
        <SignOutButton />
      </header>
      <main className="flex-1">
        <Content 
          currentGameId={currentGameId}
          setCurrentGameId={setCurrentGameId}
          playerId={playerId}
          setPlayerId={setPlayerId}
        />
      </main>
      <Toaster />
    </div>
  );
}

function Content({ 
  currentGameId, 
  setCurrentGameId, 
  playerId, 
  setPlayerId 
}: {
  currentGameId: string | null;
  setCurrentGameId: (id: string | null) => void;
  playerId: string | null;
  setPlayerId: (id: string | null) => void;
}) {
  const loggedInUser = useQuery(api.auth.loggedInUser);

  if (loggedInUser === undefined) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
      </div>
    );
  }

  return (
    <div className="h-full">
      <Authenticated>
        {currentGameId && playerId ? (
          <Game 
            gameId={currentGameId} 
            playerId={playerId}
            onLeaveGame={() => {
              setCurrentGameId(null);
              setPlayerId(null);
            }}
          />
        ) : (
          <GameLobby 
            onJoinGame={(gameId, playerId) => {
              setCurrentGameId(gameId);
              setPlayerId(playerId);
            }}
          />
        )}
      </Authenticated>
      
      <Unauthenticated>
        <div className="flex flex-col items-center justify-center h-full gap-8">
          <div className="text-center">
            <h1 className="text-6xl font-bold text-blue-400 mb-4">FPS Arena</h1>
            <p className="text-xl text-gray-300">Multiplayer 3D First-Person Shooter</p>
            <p className="text-lg text-gray-400 mt-2">Sign in to start playing</p>
          </div>
          <div className="w-full max-w-md">
            <SignInForm />
          </div>
        </div>
      </Unauthenticated>
    </div>
  );
}
