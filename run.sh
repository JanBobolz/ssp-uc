#!/bin/bash
./compile.sh

open http://localhost:8080/index.html
python3 -m http.server 8080
