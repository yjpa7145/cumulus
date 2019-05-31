#!/bin/sh

set -e

apk --no-cache add rsync zip

mkdir /build

cd /build

rsync -a --exclude node_modules /source/ .

npm install

npm run build

mkdir -p /source/dist

cp /build/dist/package.zip /source/dist/
