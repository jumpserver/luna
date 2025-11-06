export async function useWarmupSetting() {
  try {
    // 预编译与 /setting 相关的布局与页面，降低首次打开白屏
    await Promise.all([
      import("@/layouts/setting.vue"),
      import("@/pages/setting/index.vue"),
      import("@/pages/setting/ssh.vue"),
      import("@/pages/setting/telnet.vue"),
      import("@/pages/setting/sftp.vue"),
      import("@/pages/setting/rdp.vue"),
      import("@/pages/setting/vnc.vue"),
      import("@/pages/setting/mysql.vue"),
      import("@/pages/setting/mongodb.vue"),
      import("@/pages/setting/redis.vue"),
      import("@/pages/setting/pg.vue"),
      import("@/pages/setting/oracle.vue"),
      import("@/pages/setting/sqlserver.vue")
    ]);
  } catch {}
}
