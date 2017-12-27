#!/bin/bash
# coding: utf-8
# Copyright (c) 2017
# Gmail:liuzheng712
#

set -ex

git checkout publish && \
  git pull github dev --rebase && \
  git merge master -m "publish" && \
  git reset --soft HEAD^ && \
  git checkout -- .gitignore && \
  git commit -m "publish" && \
  git push github publish:dev && \
  echo "success"
git checkout master
git pull github dev --commit && git push origin master
