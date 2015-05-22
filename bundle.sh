#!/bin/sh
grunt build
electron-packager . Bracketron --platform=$1 --arch=$2 --version=$3 --ignore='^node_modules/\.bin$' --ignore='^node_modules/grunt[-a-z]*$'
