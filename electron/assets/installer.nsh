; Use the standard install-mode logic, including existing paths and /D overrides.
!undef APP_FILENAME
!define APP_FILENAME "JumpServer\Client"
; Keep explicit app-data removal tied to the product rather than its install directory.
!define /ifndef APP_PRODUCT_FILENAME "${PRODUCT_FILENAME}"
