#!/bin/bash
#
# 该build基于 node:10
utils_dir=$(pwd)
project_dir=$(dirname "$utils_dir")
release_dir=${project_dir}/release

if [[ $(uname) == 'Darwin' ]];then
  alias sedi="sed -i ''"
else
  alias sedi='sed -i'
fi

function change_version() {
   sedi "s@[0-9].[0-9].[0-9]@${VERSION}@g" "${project_dir}/src/environments/environment.prod.ts" || return 2
}

# 修改版本号文件
if [[ -n ${VERSION-''} ]]; then
  change_version || exit 2
fi

# 下载依赖模块并构建
cd "${project_dir}" && npm i || exit 3
npm rebuild node-sass
npm run-script build || exit 4

# 打包
rm -rf "${release_dir:?}"/*
to_dir="${release_dir}"
mkdir -p "${to_dir}"

mv luna "${to_dir}"
cp -R src/assets/i18n "${to_dir}/luna"
