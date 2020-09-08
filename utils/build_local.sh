#!/bin/bash

set -ex

rm -fr luna
npm run-script build

cp -R src/assets/i18n luna/
tar czf luna.tar.gz luna
md5 luna.tar.gz
