#!/bin/bash
# coding: utf-8
# Copyright (c) 2017
# Gmail:liuzheng712
#

set -ex


git checkout public && \
  git pull github dev --rebase && \
  git merge master -m "public" && \
  git reset --soft HEAD^ && \
  git commit -m "public" && \
  git push github public:dev && \
  echo "success"
git checkout master
git pull github dev --commit && git push origin master
