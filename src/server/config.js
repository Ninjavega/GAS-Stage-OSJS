const path = require('path');
const root = path.resolve(__dirname, '../../');

module.exports = {
  root,
  port: 3000,
  bind: '0.0.0.0',
  public: path.resolve(root, 'dist')
};
