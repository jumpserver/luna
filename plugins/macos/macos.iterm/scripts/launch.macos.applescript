use framework "Foundation"
use scripting additions

-- Keep this entry point in each plugin package so SSH and SFTP can be installed independently.
on connectionCommand()
    set jsonText to current application's NSProcessInfo's processInfo()'s environment()'s objectForKey:"JMS_CONNECT_JSON"
    set jsonData to (current application's NSString's stringWithString:jsonText)'s dataUsingEncoding:(current application's NSUTF8StringEncoding)
    set connection to current application's NSJSONSerialization's JSONObjectWithData:jsonData options:0 |error|:(missing value)
    if connection is missing value then error "Invalid connection context"

    set commandText to (connection's objectForKey:"command") as text
    if commandText is not "" then return commandText

    -- The helper path is shell-quoted by the launcher; quote every connection argument here.
    set helperCommand to (connection's objectForKey:"helper") as text
    if helperCommand is "" then error "SSH helper is missing"
    set clientProtocol to (connection's objectForKey:"protocol") as text
    if clientProtocol is not in {"ssh", "sftp"} then error "Unsupported terminal protocol"
    set target to ((connection's objectForKey:"username") as text) & "@" & ((connection's objectForKey:"host") as text)
    set clientPort to (connection's objectForKey:"port") as text
    set clientPassword to (connection's objectForKey:"value") as text
    return helperCommand & " " & quoted form of clientProtocol & " " & quoted form of target & " -p " & quoted form of clientPort & " -P " & quoted form of clientPassword
end connectionCommand

on run
    set commandText to my connectionCommand()
    tell application id "com.googlecode.iterm2"
        activate
        if (count of windows) > 0 then
            tell current window
                set targetTab to create tab with default profile
            end tell
        else
            create window with default profile
            tell current window
                set targetTab to current tab
            end tell
        end if
        tell targetTab
            tell current session
                write text commandText
            end tell
        end tell
    end tell
end run
