!macro NSIS_HOOK_POSTINSTALL
  ; 删除 Windows 对 jms 协议的用户选择缓存。
  ; 如果旧 Electron 版本曾经被记录为默认处理程序，这个缓存可能会继续盖过新注册项。
  DeleteRegKey HKCU "Software\Microsoft\Windows\Shell\Associations\UrlAssociations\jms\UserChoice"

  ; 显式写入 HKCU\Software\Classes\jms。
  ; HKCU 的协议注册优先级高于 HKLM，所以可以覆盖旧版本可能留下的机器级注册。
  WriteRegStr HKCU "Software\Classes\jms" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\jms" "" "URL:jms"
  WriteRegStr HKCU "Software\Classes\jms" "FriendlyTypeName" "JumpServer Client URL"

  ; 系统 UI 中显示的协议图标。
  WriteRegStr HKCU "Software\Classes\jms\DefaultIcon" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"

  ; 打开 jms:// 链接时执行的命令。%1 是浏览器或系统传进来的原始链接。
  WriteRegStr HKCU "Software\Classes\jms\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""

  ; 通知 Windows shell 协议关联已经变化，避免系统继续使用旧缓存。
  System::Call 'shell32::SHChangeNotify(i, i, p, p) (0x08000000, 0x1000, 0, 0)'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; 只在当前 HKCU jms 协议确实指向本安装目录时删除，避免误删其他应用新接管的注册。
  ReadRegStr $R7 HKCU "Software\Classes\jms\shell\open\command" ""
  StrCmp $R7 "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\"" 0 +2
    DeleteRegKey HKCU "Software\Classes\jms"

  ; 通知 Windows shell 协议关联已经变化，避免卸载后继续使用旧缓存。
  System::Call 'shell32::SHChangeNotify(i, i, p, p) (0x08000000, 0x1000, 0, 0)'
!macroend
