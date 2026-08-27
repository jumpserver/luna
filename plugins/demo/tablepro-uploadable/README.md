# TablePro Uploadable Plugin

This is a minimal user-installable JumpServer plugin for database connections on macOS.

It is designed to test the upload and install flow for third-party plugins:

- protocol category: `databases`
- supported protocols: `mysql`, `mariadb`, `postgresql`
- launch strategy: plugin `script` mode with `/bin/bash`
- behavior: receive `JMS_CONNECT_JSON` plus rendered env vars, URL-encode connection fields, build a database URL, and call `open`

## Package It

From the repository root:

```bash
cd /Users/guang/projects/clients/plugins/demo/tablepro-uploadable
zip -r /Users/guang/projects/clients/dist/com.jumpserver.tablepro@1.0.0.jscplugin .
```

## Notes

- This plugin is intentionally macOS-only.
- It does not depend on builtin plugin indexes.
- It is shaped for user upload/install testing rather than polished product distribution.
- It exercises the third-party plugin script path, not only plain argument templating.
