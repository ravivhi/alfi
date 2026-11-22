// The letters content the app runs on. Until the owner has reviewed the draft (Task 15) this is the dev fixture.
import type { LettersContent } from './schema.ts';
import data from '../../content/dev-fixture.json';

export const CONTENT = data as LettersContent;
