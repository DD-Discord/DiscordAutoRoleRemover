const fs = require('fs');
const path = require('path');

const modals = {};

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
    const modal = require(path.join(__dirname, file));
    console.log('Found modal', modal)
    modals[modal.name] = modal;
  });

module.exports.modals = modals;
