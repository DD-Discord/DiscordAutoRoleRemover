import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { Command } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const commands: Record<string, Command> = {};

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

// Dynamic `import()` (rather than `require()`) so every command module resolves
// through the same ESM module graph as the rest of the app - mixing require()
// and import() for the same files would load two separate module instances,
// each with its own copy of any module-level state (e.g. db.ts's cache).
await Promise.all(files.map(async file => {
  const command: Command = await import(pathToFileURL(path.join(__dirname, file)).href);
  console.log('Found command', command)
  commands[command.name] = command;
}));
