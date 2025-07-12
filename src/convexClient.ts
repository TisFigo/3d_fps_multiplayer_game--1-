// src/convexClient.ts
import { ConvexReactClient } from "convex/react";

// Pull Convex URL from environment variable
const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

export default convex;
