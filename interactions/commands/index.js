const fs = require('fs');
const path = require('path');

const commands = {};

const basename = path.basename(__filename);
fs
  .readdirSync(__dirname)
  .filter(file => {
    return (
      file.indexOf('.') !== 0 &&
      file !== basename &&
      file.slice(-3) === '.js' &&
      file.indexOf('.test.js') === -1
    );
  })
  .forEach(file => {
    const command = require(path.join(__dirname, file));
    console.log('Found command', command)
    commands[command.name] = command;
  });

module.exports.commands = commands;
