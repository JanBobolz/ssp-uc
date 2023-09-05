npm install rollup --save-dev

#npm i codemirror @codemirror/lang-javascript
# npm i rollup @rollup/plugin-node-resolve
# npm i @codemirror/legacy-modes
npm install

node_modules/.bin/rollup editor.mjs -f iife -o editor.bundle.js \
  -p @rollup/plugin-node-resolve
