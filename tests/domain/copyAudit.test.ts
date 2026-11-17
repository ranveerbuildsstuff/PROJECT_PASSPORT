import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Copy Tone & Overclaim Audit (DESIGN §1)', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const targetFiles = [
    path.join(rootDir, 'src/pages/WelcomePage.tsx'),
    path.join(rootDir, 'src/pages/PrivacyPage.tsx'),
    path.join(rootDir, 'DEPLOY.md'),
  ];

  // Forbidden hype words per DESIGN.md §1
  const HYPE_WORDS = [
    'supercharge',
    'supercharged',
    'effortless',
    'effortlessly',
    'magical',
    'magically',
    'seamless',
    'seamlessly',
    'revolutionary',
    'game-changing',
    'miraculous',
    'blazing-fast',
    'unparalleled',
  ];

  // Forbidden overclaims and misleading security/capability promises
  const OVERCLAIMS = [
    'bypass',
    '100% secure',
    'completely secure',
    'unbreakable',
    'unhackable',
    'foolproof',
    'guaranteed security',
    'military-grade',
    'silver bullet',
  ];

  for (const filePath of targetFiles) {
    const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');

    it(`${relativePath} contains zero DESIGN §1 hype words`, () => {
      const content = fs.readFileSync(filePath, 'utf-8');
      const foundWords: string[] = [];

      for (const word of HYPE_WORDS) {
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        if (regex.test(content)) {
          foundWords.push(word);
        }
      }

      expect(
        foundWords,
        `Found forbidden hype words in ${relativePath}: ${foundWords.join(', ')}`
      ).toEqual([]);
    });

    it(`${relativePath} contains zero overclaims or false security promises`, () => {
      const content = fs.readFileSync(filePath, 'utf-8');
      const foundOverclaims: string[] = [];

      for (const claim of OVERCLAIMS) {
        const regex = new RegExp(claim.includes(' ') ? claim : `\\b${claim}\\b`, 'i');
        if (regex.test(content)) {
          foundOverclaims.push(claim);
        }
      }

      expect(
        foundOverclaims,
        `Found forbidden overclaim in ${relativePath}: ${foundOverclaims.join(', ')}`
      ).toEqual([]);
    });
  }
});
