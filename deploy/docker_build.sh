#!/bin/bash
# coding: utf-8
# Copyright (c) 2017
# Gmail:liuzheng712
#

set -ex
npm i
npm run-script build
docker build -t luna .
