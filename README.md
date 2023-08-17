# Luna

Luna 是 JumpServer 的 Web Terminal 项目,
主要使用 [Angular](https://angular.io/), [Material](https://material.angular.io/) 完成,
名字来源于 Dota 英雄 [Luna](https://www.dota2.com/hero/luna)

## 开发运行

```
0. 前置条件: 部署运行好 JumpServer API 服务器

1. 安装依赖
$ npm install

2. 运行
$ npm run start

3. 构建
$ rm -fr luna
$ npm run-script build
```

## 生产中部署

下载 RELEASE 文件，放到合适的目录，修改 nginx配置文件如下Nginx config:

```
  location /luna/ {
    try_files $uri / /index.html;
    alias /path/of/your/luna/;
  }
```

## License & Copyright

Be consistent with [jumpserver](https://github.com/jumpserver/jumpserver)
