import { loadFont as loadBebasNeue } from "@remotion/google-fonts/BebasNeue";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";

export const bebasNeue = loadBebasNeue();
export const inter = loadInter("normal", { weights: ["700", "900"] });
export const playfairDisplay = loadPlayfair("normal", { weights: ["700", "900"] });
