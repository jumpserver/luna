-- JumpServer Client plugin launch script (macOS demo)
-- Receives connection context via JMS_CONNECT_JSON environment variable.

on run
	set connectJson to system attribute "JMS_CONNECT_JSON"
	if connectJson is missing value or connectJson is "" then
		error "JMS_CONNECT_JSON is not set"
	end if

	-- Minimal parsing for demo (production scripts may shell out to jq/python)
	set msg to "Hello Terminal Demo" & return & return & connectJson

	display dialog msg buttons {"OK"} default button "OK" with title "JumpServer Plugin Demo"
end run
