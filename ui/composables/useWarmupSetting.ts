export async function useWarmupSetting() {
  try {
    const imports = [
      import("@/layouts/setting.vue"),
      import("@/pages/setting/index.vue"),
      import("@/pages/setting/general.vue"),
      import("@/pages/setting/appearance.vue"),
      import("@/pages/setting/about.vue")
    ];

    if (isDesktopRuntime()) {
      imports.push(
        import("@/pages/setting/application/terminal.vue"),
        import("@/pages/setting/application/ssh.vue"),
        import("@/pages/setting/application/telnet.vue"),
        import("@/pages/setting/application/sftp.vue"),
        import("@/pages/setting/application/rdp.vue"),
        import("@/pages/setting/application/vnc.vue"),
        import("@/pages/setting/application/mysql.vue"),
        import("@/pages/setting/application/mongodb.vue"),
        import("@/pages/setting/application/redis.vue"),
        import("@/pages/setting/application/pg.vue"),
        import("@/pages/setting/application/oracle.vue"),
        import("@/pages/setting/application/sqlserver.vue")
      );
    }

    await Promise.all(imports);
  } catch {}
}
