import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { Modal } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const modals: Record<string, Modal> = {};

const basename = path.basename(__filename);
const files = fs
  .readdirSync(__dirname)
  .filter(file => {
    return (
      file.indexOf('.') !== 0 &&
      file !== basename &&
      (file.endsWith('.ts') || file.endsWith('.js')) &&
      file.indexOf('.test.') === -1
    );
  });

// See commands/index.ts for why dynamic import() (not require()) is used here.
await Promise.all(files.map(async file => {
  const modal: Modal = await import(pathToFileURL(path.join(__dirname, file)).href);
  console.log('Found modal', modal)
  modals[modal.name] = modal;
}));
