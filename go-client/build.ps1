set CGO_ENABLED=0
set GOOS=windows

set GOARCH=amd64
go build -trimpath -ldflags "-w -s -H windowsgui" -o build/windows/JumpServerClient.exe ./cmd/awaken/
set GOARCH=386
go build -trimpath -ldflags "-w -s -H windowsgui" -o build/windows/JumpServerClient32.exe ./cmd/awaken/


Copy-Item -Path "build/*" -Destination "../src-tauri/resources/bin/" -Recurse -Force
Copy-Item -Path config.json -Destination "../src-tauri/resources/bin/" -Force
Copy-Item -Path putty.exe -Destination "../src-tauri/resources/bin/windows/" -Force
Copy-Item -Path "pkg/autoit/*.dll" -Destination "../src-tauri/resources/bin/windows/" -Force