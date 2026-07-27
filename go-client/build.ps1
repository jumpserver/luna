New-Item -ItemType Directory -Force -Path "../src-tauri/resources/plugins/" | Out-Null
Remove-Item -Path "../src-tauri/resources/plugins/windows","../src-tauri/resources/plugins/macos","../src-tauri/resources/plugins/linux" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Path "../plugins/windows" -Destination "../src-tauri/resources/plugins/" -Recurse -Force
Copy-Item -Path "../plugins/macos" -Destination "../src-tauri/resources/plugins/" -Recurse -Force
Copy-Item -Path "../plugins/linux" -Destination "../src-tauri/resources/plugins/" -Recurse -Force
