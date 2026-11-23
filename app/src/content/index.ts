// The letters content the app runs on: the owner-reviewed letters (the dev fixture mirrors it for tests).
import type { LettersContent } from './schema.ts';
import data from '../../content/letters-3-5.json';

export const CONTENT = data as LettersContent;
