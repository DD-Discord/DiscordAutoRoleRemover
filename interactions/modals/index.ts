import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { Modal } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

export const modals: Record<string, Modal> = {};

const basename = path.basename(__filename);
fs
  .readdirSync(__dirname)
  .filter(file => {
    return (
      file.indexOf('.') !== 0 &&
      file !== basename &&
      (file.endsWith('.ts') || file.endsWith('.js')) &&
      file.indexOf('.test.') === -1
    );
  })
  .forEach(file => {
    const modal: Modal = require(path.join(__dirname, file));
    console.log('Found modal', modal)
    modals[modal.name] = modal;
  });
