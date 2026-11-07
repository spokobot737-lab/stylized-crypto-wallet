export const CHESS_LEVELS={easy:{level:1,depth:1,milliseconds:400},medium:{level:2,depth:2,milliseconds:1000},hard:{level:3,depth:3,milliseconds:2200}} as const;
export type Difficulty=keyof typeof CHESS_LEVELS;
