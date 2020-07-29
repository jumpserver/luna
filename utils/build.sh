#!/bin/bash
#
# 该build基于 node:10
utils_dir=$(pwd)
project_dir=$(dirname "$utils_dir")
release_dir=${project_dir}/release

if [[ $(uname) == 'Darwin' ]]; then
  alias sedi="sed -i ''"
else
  alias sedi='sed -i'
fi

function change_version() {
  sedi "s@[0-9].[0-9].[0-9]@${VERSION}@g" "${project_dir}/src/environments/environment.prod.ts" || return 2
}

install_deps() {
  # 下载依赖模块并构建
  cd "${project_dir}" && npm i --loglevel verbose || exit 3
  npm rebuild node-sass
}

build() {
  # 修改版本号文件
  cd "${project_dir}" || exit 1
  if [[ -n ${VERSION-''} ]]; then
    change_version || exit 2
  fi

  npm run-script build || exit 4

  # 打包
  rm -rf "${release_dir:?}"/*
  to_dir="${release_dir}"
  mkdir -p "${to_dir}"
  mv luna "${to_dir}"
  cp -R src/assets/i18n "${to_dir}/luna"
}

case "${1-}" in
dep)
  install_deps
  ;;
build)
  build
  ;;
*)
  install_deps
  build
  ;;
esac
