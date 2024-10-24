#!/bin/bash
set -e
set -o pipefail

npm run build

rm -f isolate-0x*-v8.log
node --prof speed-test.js

node --prof-process isolate-0x*.log > processed.txt
cat processed.txt
