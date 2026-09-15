import type { DataMode } from "./types";

/**
 * Which research runner the app uses.
 * - "sample" (default until Phase 2): labeled UI fixtures, never saved to history.
 * - "live": streams real research from /api/research.
 */
export const DATA_MODE: DataMode = process.env.NEXT_PUBLIC_DATA_MODE === "live" ? "live" : "sample";
