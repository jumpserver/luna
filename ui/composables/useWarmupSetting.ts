export async function useWarmupSetting() {
  try {
    // 预编译与 /setting 相关的布局与页面，降低首次打开白屏
    await Promise.all([
      import("@/layouts/setting.vue"),
      import("@/pages/setting/index.vue"),
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
    ]);
  } catch {}
}
