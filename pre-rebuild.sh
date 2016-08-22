#!/bin/sh
echo "./pre-rebuild.sh"

# Remove nslog.node from nslog to avoid build errors
file="./node_modules/nslog/build/Release/nslog.node"
if [ -f $file ]; then
    echo "rm $file"
    rm $file
else
    echo "skip rm, not found $file"
fi
