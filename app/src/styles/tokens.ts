export const TOKENS: Record<string, string> = {
  ink: '#1D2742',
  inkSoft: '#4A5878',
  accent: '#1E4FBF',
  accentShadow: '#163C91',
  ok: '#2E9E5B',
  okInk: '#1E7442',
  next: '#FFA928',
  neutral: '#FFFFFF',
  neutralAlt: '#E8EEF6',
  bgSky: '#EAF5FF',
  bgSand: '#FFF6E5',
  bgGrass: '#DDF2E2',
  bgCheck: '#FFF1E8',
  bgNight: '#1E3A7A',
  danger: '#A12A2A',
  dangerBg: '#FFF4F4',
  white: '#FFFFFF',
  // the result window, in the old app's colours
  resultInk: '#0D2A5C',
  resultGo: '#2EB85C',
  resultAgain: '#FFC928',
  resultHeading: '#E53935',
  // letter faces (FACE_PALETTE), the old plane's balloon colours
  faceYellow: '#FFC928',
  faceRed: '#E53935',
  faceBlue: '#1E6FD9',
  faceGreen: '#2EB85C',
  faceOrange: '#FB8C00',
  facePurple: '#AB47BC',
  faceCyan: '#00ACC1',
};

export const TOKEN_PAIRS: { fg: string; bg: string; large: boolean; icon?: boolean; where: string }[] = [
  { fg: 'white', bg: 'accent', large: false, where: 'setup start button' },
  { fg: 'ink', bg: 'next', large: true, where: 'glowing station letter' },
  { fg: 'white', bg: 'ok', large: true, where: 'done station letter' },
  { fg: 'resultInk', bg: 'resultGo', large: true, where: 'result window continue / try again button' },
  { fg: 'resultInk', bg: 'resultAgain', large: true, where: 'result window again button' },
  { fg: 'resultHeading', bg: 'white', large: true, where: 'result window heading' },
  { fg: 'resultInk', bg: 'white', large: true, where: 'result window fail line' },
  { fg: 'inkSoft', bg: 'bgSky', large: false, where: 'soft text on sky' },
  { fg: 'okInk', bg: 'bgSky', large: false, where: 'ok text on sky' },
  { fg: 'bgNight', bg: 'white', large: false, where: 'end "to map" button' },
  { fg: 'danger', bg: 'dangerBg', large: false, where: 'warning text' },
  { fg: 'ink', bg: 'faceYellow', large: true, where: 'letter face faceYellow' },
  { fg: 'white', bg: 'faceRed', large: true, where: 'letter face faceRed' },
  { fg: 'white', bg: 'faceBlue', large: true, where: 'letter face faceBlue' },
  { fg: 'ink', bg: 'faceGreen', large: true, where: 'letter face faceGreen' },
  { fg: 'ink', bg: 'faceOrange', large: true, where: 'letter face faceOrange' },
  { fg: 'white', bg: 'facePurple', large: true, where: 'letter face facePurple' },
  { fg: 'ink', bg: 'faceCyan', large: true, where: 'letter face faceCyan' },
  { fg: 'ink', bg: 'neutral', large: false, where: 'word option on white' },
  { fg: 'ink', bg: 'neutralAlt', large: false, where: 'soft grey surface' },
];

export function applyTokens(root: HTMLElement): void {
  for (const [name, value] of Object.entries(TOKENS)) root.style.setProperty('--' + name, value);
}
