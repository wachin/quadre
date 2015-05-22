#!/bin/sh
electron-packager . Bracketron --platform=$1 --arch=$2 --version=$3 --ignore='./node_modules/\.bin$' --ignore='./node_modules/electron-rebuild$' --ignore='./node_modules/grunt[-a-z]*$'
