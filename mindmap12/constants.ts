export const NODE_COLORS: string[] = [
  '#a855f7', // violet-500 (Purple for Sales)
  '#14b8a6', // teal-500 (Teal for Development)
  '#22c55e', // green-500 (Green for Marketing)
  '#0ea5e9', // sky-500
  '#6366f1', // indigo-500
  '#d946ef', // fuchsia-500
  '#ec4899', // pink-500
  '#f43f5e', // rose-500
];

export const ROOT_NODE_COLOR = '#3b82f6'; // blue-500

export const PALETTE_COLORS = [ROOT_NODE_COLOR, ...NODE_COLORS];

/**
 * Lightens a hex color by a given percentage.
 * @param hex The hex color string (e.g., '#RRGGBB').
 * @param percent The percentage to lighten by (0-100).
 * @returns The new hex color string.
 */
export const lightenHexColor = (hex: string, percent: number): string => {
    // 1. Remove '#' and handle shorthand hex
    let color = hex.startsWith('#') ? hex.slice(1) : hex;
    if (color.length === 3) {
        color = color.split('').map(char => char + char).join('');
    }

    // 2. Parse hex to RGB
    const num = parseInt(color, 16);
    let r = (num >> 16) & 255;
    let g = (num >> 8) & 255;
    let b = num & 255;

    // 3. Apply lightening
    const amount = Math.round(2.55 * percent);
    r = Math.min(255, r + amount);
    g = Math.min(255, g + amount);
    b = Math.min(255, b + amount);

    // 4. Convert back to hex
    const toHex = (c: number) => ('0' + c.toString(16)).slice(-2);
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

/**
 * Determines the final node color based on a branch's base color and the node's semantic type.
 * @param baseColor The base color of the branch.
 * @param nodeType The semantic type of the node from the AI.
 * @param depth The depth of the node in the mind map tree.
 * @returns The final hex color string for the node.
 */
export const determineNodeColorByType = (baseColor: string, nodeType?: string, depth?: number): string => {
    // Don't modify colors for root (depth 0) or main branches (depth 1) to preserve the base color
    if (depth !== undefined && depth <= 1) {
        return baseColor;
    }
    if (!nodeType) {
        return baseColor; // Return base color if no type is provided
    }
    switch (nodeType) {
        case 'CATEGORY':
            return baseColor; // No change for categories
        case 'CONCEPT':
        case 'GATE_TYPE':
        case 'EXPRESSION':
            return lightenHexColor(baseColor, 20); // 20% lighter for concepts
        case 'EXAMPLE':
        case 'TRUTH_TABLE':
            return lightenHexColor(baseColor, 40); // 40% lighter for examples
        default:
            return baseColor;
    }
};


// ===================================================================
// IMPORTANT: ACTION REQUIRED
// Replace the placeholder value below with your actual Firebase User UID
// to grant access to the Super Admin Panel.
// You can find your UID in the Firebase Authentication console.
// ===================================================================
export const SUPER_ADMIN_UID = 'fYCpcIideMYs09ZkgZm31cGzQks1';

/**
 * Blends two RGB colors.
 * @param color1 The first RGB color array [R, G, B].
 * @param color2 The second RGB color array [R, G, B].
 * @param weight The weight of the first color (0-1).
 * @returns The blended RGB color array.
 */
const blendRgb = (color1: [number, number, number], color2: [number, number, number], weight: number): [number, number, number] => {
  const w1 = Math.max(0, Math.min(1, weight));
  const w2 = 1 - w1;
  const r = Math.round(color1[0] * w1 + color2[0] * w2);
  const g = Math.round(color1[1] * w1 + color2[1] * w2);
  const b = Math.round(color1[2] * w1 + color2[2] * w2);
  return [r, g, b];
};

/**
 * Converts an RGB color array to a hex string.
 * @param rgb The RGB color array [R, G, B].
 * @returns The hex color string.
 */
const rgbToHex = (rgb: [number, number, number]): string => {
    return '#' + rgb.map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
};

/**
 * Calculates a background color for a node based on its mastery score.
 * It creates a subtle tint from red to yellow to green on the node's base background.
 * @param masteryScore The mastery score from 0 to 1.
 * @param theme The current theme ('light' or 'dark').
 * @returns A hex color string, or undefined if the score is 0.
 */
export const getMasteryBackgroundColor = (masteryScore: number, theme: 'light' | 'dark'): string | undefined => {
    if (masteryScore <= 0) {
        return undefined; // Let Tailwind classes apply the default background.
    }

    const RED: [number, number, number] = [239, 68, 68];
    const YELLOW: [number, number, number] = [245, 158, 11];
    const GREEN: [number, number, number] = [34, 197, 94];
    
    const LIGHT_BASE: [number, number, number] = [255, 255, 255]; // white
    const DARK_BASE: [number, number, number] = [51, 65, 85];     // slate-700

    let masteryColor: [number, number, number];

    if (masteryScore <= 0.5) {
        const t = masteryScore * 2; // Scale 0-0.5 to 0-1
        masteryColor = blendRgb(YELLOW, RED, t);
    } else {
        const t = (masteryScore - 0.5) * 2; // Scale 0.5-1 to 0-1
        masteryColor = blendRgb(GREEN, YELLOW, t);
    }

    const baseColor = theme === 'light' ? LIGHT_BASE : DARK_BASE;
    const TINT_WEIGHT = 0.25; // 25% mastery color, 75% base color
    const finalRgb = blendRgb(masteryColor, baseColor, TINT_WEIGHT);

    return rgbToHex(finalRgb);
};