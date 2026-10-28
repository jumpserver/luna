// Stable Chen error codes and compatibility aliases for plain-text metadata/validation errors.
// User-facing translations live in i18n/locales/* under Chen.Errors.
export const chenErrorCatalog: Record<string, readonly string[]> = {
  idle_disconnect: ["The session was disconnected due to inactivity. Reconnect to continue."],
  max_session_timeout: ["The maximum session duration was reached. Reconnect to continue."],
  admin_terminate: ["An administrator terminated this session."],
  session_locked: ["An administrator paused this session. Wait for it to resume."],
  permission_revoked: ["Access to this session was revoked."],
  permission_expires_in_10_minutes: [
    "Access will expire soon. The session is paused; contact an administrator to renew it."
  ],
  session_control_restored: ["The session control connection was restored."],
  unsupported_session_control: ["An unsupported session control instruction paused this session."],
  client_closed: ["The connection was closed."],
  server_shutdown: ["The service shut down. Reconnect when it is available."],
  server_stopping: ["Server is stopping", "The service is stopping. Reconnect when it is available."],
  session_closed: ["Session is closed", "The session is closed. Reconnect to continue."],
  session_unavailable: [
    "Session changed while opening console",
    "Session is unavailable",
    "Session or console changed while submitting SQL",
    "Session or console is unavailable",
    "The session is unavailable. Check the connection state."
  ],
  session_control_not_ready: [
    "Session control is not ready. Retry the connection shortly.",
    "Session control is temporarily unavailable; retry this connection attempt after it recovers"
  ],
  session_control_unavailable: [
    "Session control was interrupted and operations are paused. Check the connection after it recovers.",
    "Session control was lost during authentication; open a new connection from JumpServer after it recovers"
  ],
  permission_expired: ["Connection authorization expired. Request access again.", "Connection permission has expired"],
  authentication_failed: [
    "Connection authentication failed. Start a new connection from the workspace.",
    "Connection authorization failed"
  ],
  unauthorized: [
    "Invalid session authorization",
    "Session authentication is no longer valid. Reconnect to continue.",
    "Session is unavailable",
    "Session token required"
  ],
  connect_permission_denied: [
    "Connection permission is denied",
    "You do not have permission to connect to this database. Contact an administrator."
  ],
  connection_failed: [
    "Could not connect to the database. Check the service, network and account configuration.",
    "Database connection could not be established",
    "Unable to open console connection"
  ],
  connection_lost: [
    "Open a new console; connection state was lost",
    "Open a new console; the previous connection state cannot be restored",
    "Reconnect before saving",
    "The database connection was lost and its state cannot be restored. Open a new query connection."
  ],
  connection_token_claimed: [
    "This connection token belongs to another attempt. Start a new connection from the workspace.",
    "This connection token belongs to another connection attempt"
  ],
  connection_token_rejected: [
    "The Core connection token was rejected",
    "The connection token is invalid or expired. Start a new connection from the workspace."
  ],
  connection_token_required: [
    "A Core connection token is required",
    "A connection token is required. Start the connection from the workspace."
  ],
  invalid_token: [
    "A valid connection token is required. Start a new connection from the workspace.",
    "Connection token required"
  ],
  token_exchange_failed: [
    "Connection authorization service is unavailable",
    "The connection authorization service is unavailable. Try again shortly."
  ],
  selector_not_found: [
    "No database configuration matches the selector in the URL.",
    "No database is configured for this selector"
  ],
  invalid_selector: [
    "Single mode requires a configured selector and no connection token",
    "The database selector is invalid. Check the single-mode configuration and selector in the URL."
  ],
  mode_mismatch: [
    "The connection method does not match the service mode. Use the matching managed or single-mode entry."
  ],
  origin_denied: [
    "Cross-site request denied",
    "Request origin is not trusted",
    "This page origin is not authorized. Use a trusted workspace address."
  ],
  ambiguous_connection_protocol: [
    "Connection authorization did not select one database protocol. Check the asset configuration.",
    "Core authorization must select one database protocol"
  ],
  incomplete_connection_authorization: [
    "Connection authorization is incomplete. Check the asset and account configuration.",
    "Core returned incomplete connection authorization"
  ],
  incomplete_connection_identity: [
    "Connection identity is incomplete. Request a new connection authorization.",
    "Core returned incomplete connection identity"
  ],
  invalid_authorized_database_port: [
    "Core returned an invalid database port",
    "The authorized database port is invalid. Ask an administrator to correct it."
  ],
  invalid_session_time_limit: [
    "Core returned invalid session time limits",
    "The session time limit is invalid. Ask an administrator to correct it."
  ],
  core_session_create_failed: [
    "Core audit session creation failed",
    "Could not create the Core audit session. Check the Core service connection."
  ],
  core_session_create_rejected: [
    "Core rejected audit session creation",
    "Core rejected the audit session. Check connection authorization."
  ],
  face_monitor_join_failed: [
    "Core could not attach this session to face monitoring",
    "Could not attach face monitoring to the session. Check the Core configuration."
  ],
  gateway_forward_failed: [
    "Could not establish the authorized gateway connection. Check the gateway status.",
    "The authorized gateway connection could not be created"
  ],
  audit_persistence_failed: [
    "Audit records could not be saved. Ask an administrator to check audit storage and connectivity.",
    "Audit storage is unavailable",
    "Audit storage is unavailable; SQL was not sent",
    "Catalog access could not be audited",
    "Catalog result could not be audited",
    "Completion access could not be audited",
    "Edit metadata could not be audited",
    "Edit preview could not be audited",
    "Execution intent could not be recorded; SQL was not sent",
    "Export could not be audited",
    "Metadata access could not be audited",
    "SQL analysis access could not be audited",
    "Save intent could not be recorded; no changes were sent"
  ],
  session_limit: [
    "Session capacity reached",
    "The session limit was reached. Close unused connections before trying again."
  ],
  console_limit: ["Console capacity reached", "The query connection limit was reached. Close unused query tabs."],
  console_busy: [
    "Metadata is unavailable while this console is executing",
    "This query connection is busy. Wait for the current operation to finish.",
    "Wait for the current console operation to finish"
  ],
  execution_limit: [
    "Open a new session to continue",
    "Session execution history limit reached; open a new session",
    "The execution history limit was reached. Open a new session to continue."
  ],
  queue_full: ["Console queue is full", "The query queue is full. Wait for existing tasks to finish."],
  subscriber_limit: [
    "The event subscription limit was reached. Close unused pages before retrying.",
    "Too many event subscriptions"
  ],
  not_found: [
    "Console not found",
    "Edit preview not found",
    "Execution not found",
    "Export not found",
    "Resource not found",
    "Result not found",
    "The requested resource does not exist or is no longer available. Refresh and try again."
  ],
  invalid_context: [
    "Could not open the specified database or schema. Check its name and access permissions.",
    "Invalid database context",
    "Unable to open database context"
  ],
  json_required: ["JSON request required", "This request requires JSON data."],
  invalid_request: [
    "Export format requires the exports endpoint",
    "Invalid JSON request",
    "The request parameters or format are invalid. Refresh the page and try again.",
    "Trailing JSON is not allowed"
  ],
  invalid_event_cursor: [
    "Invalid event cursor",
    "The event synchronization position is invalid. Reconnect to continue."
  ],
  request_id_required: [
    "A stable random request_id of 16 to 128 characters is required",
    "A stable request_id is required",
    "The request is missing a valid identifier. Refresh the page and try again."
  ],
  request_id_conflict: [
    "Request body and idempotency header disagree",
    "The request identifiers do not match. Refresh the page and try again."
  ],
  idempotency_conflict: [
    "Request ID already belongs to different SQL",
    "Request ID belongs to another operation",
    "Request id belongs to another export",
    "This request identifier belongs to another operation. Check the earlier outcome before submitting again."
  ],
  request_canceled: [
    "Catalog request was canceled",
    "The operation was aborted.",
    "The operation was canceled.",
    "This operation was aborted"
  ],
  network_error: [
    "Failed to fetch",
    "Load failed",
    "Network request failed",
    "NetworkError when attempting to fetch resource.",
    "The network request failed. Check network connectivity and service availability.",
    "fetch failed"
  ],
  http_error: ["The service request failed (HTTP {status}). Check service availability."],
  unexpected_error: ["The operation failed. Check the details or contact an administrator."],
  original_detail: ["Original diagnostic details"],
  error_code: ["Error code"],
  analysis_failed: [
    "Cannot determine statement boundaries; select SQL explicitly or use Run all",
    "Could not determine SQL statement boundaries. Select the SQL explicitly or use Run all."
  ],
  completion_failed: [
    "Could not analyze the completion position. Check the SQL context and try again.",
    "Unable to analyze completion context"
  ],
  invalid_sql: ["SQL is empty or too large", "SQL must not be empty or exceed the service size limit."],
  sql_parse_error: ["SQL parsing failed. Check the syntax and database dialect."],
  sql_context_changed: [
    "Statement boundaries changed with the connection SQL mode; run statements separately",
    "The connection SQL mode changed. Run the statements individually."
  ],
  statement_limit: [
    "A script must contain at most 100 statements",
    "A script must contain between 1 and 100 statements",
    "Each execution must contain between 1 and 100 SQL statements."
  ],
  query_canceled: ["Query cancellation requested", "The query was canceled."],
  query_timeout: [
    "Query deadline exceeded",
    "The query timed out. Narrow the query or adjust the timeout configuration."
  ],
  cancel_unsupported: [
    "The installed database driver cannot cancel a running query.",
    "The installed database driver cannot cancel an active query"
  ],
  execution_unknown: [
    "The database outcome is unknown. Verify the data before repeating the SQL.",
    "The database outcome is unknown; do not automatically repeat this SQL"
  ],
  script_partial_failure: [
    "Earlier statements completed and may have taken effect. Verify the outcome before repeating the entire script."
  ],
  script_partial_cancel: [
    "The script was canceled, but earlier statements may have taken effect. Verify the outcome first."
  ],
  partial_statements: [
    "The first {count} statements completed and may have taken effect. Do not automatically repeat the entire script."
  ],
  database_error: [
    "Database operation failed; the connection may no longer be usable",
    "The database operation failed. Check the diagnostics and connection state."
  ],
  diagnostic_hidden: ["Database diagnostic details are hidden by the data masking policy."],
  database_syntax: ["The SQL syntax is invalid. Check the statement."],
  database_missing_table: ["The table or view does not exist. Check its name, schema and current database."],
  database_missing_column: ["The column does not exist or cannot be resolved. Check its name and alias."],
  database_duplicate: ["The data violates a unique constraint. Check for duplicate primary-key or unique values."],
  database_constraint: [
    "The data violates a constraint. Check required fields, foreign keys and constraint conditions."
  ],
  database_permission: ["The database denied access. Check the account permissions on the target object."],
  database_type: ["A data type or format is invalid. Check the column type and input value."],
  database_deadlock: [
    "A deadlock or concurrency conflict occurred. Check transaction state before deciding whether to retry."
  ],
  database_transaction_failed: ["The current transaction has failed. Roll it back before continuing."],
  metadata_failed: [
    "Could not read database metadata. Check connectivity and access permissions.",
    "Unable to load authorized database columns",
    "Unable to load authorized database relations",
    "Unable to read database SQL settings",
    "Unable to read database context"
  ],
  catalog_busy: [
    "Catalog request capacity reached",
    "Too many catalog requests are active. Try again shortly.",
    "Too many catalog requests for this session"
  ],
  catalog_database_required: [
    "Configure a database before browsing its catalog",
    "Configure a database for this connection before browsing the catalog."
  ],
  catalog_failed: [
    "Could not read the authorized catalog. Check connectivity and access permissions.",
    "Unable to read the authorized catalog"
  ],
  catalog_forbidden: ["Catalog access is denied", "Catalog access is denied."],
  catalog_not_found: [
    "Object is unavailable or does not exist",
    "The object does not exist or is unavailable. Refresh the catalog."
  ],
  catalog_scope_changed: [
    "Catalog database scope changed",
    "The catalog database scope changed. Refresh and try again."
  ],
  catalog_timeout: ["Catalog request timed out", "The catalog request timed out. Try again shortly."],
  catalog_unavailable: [
    "Could not initialize catalog access. Check the connection.",
    "Unable to initialize catalog access"
  ],
  invalid_catalog_cursor: [
    "Page cursor does not match this catalog request",
    "The catalog page cursor is no longer valid. Refresh the catalog."
  ],
  invalid_catalog_request: [
    "PostgreSQL columns require an explicit schema",
    "The catalog request is invalid. Select the database, schema or object again."
  ],
  command_denied: ["Saving is not permitted", "This SQL operation was blocked by command policy."],
  command_rejected_by_acl: ["This SQL was blocked by a command filter rule."],
  command_review_required: ["This SQL requires review. Submit it for approval first."],
  command_review_rejected: ["The SQL review was rejected. Execution was not authorized."],
  command_review_canceled: ["The SQL review was canceled."],
  command_review_timed_out: ["The SQL review timed out. Submit a new review request."],
  command_review_create_failed: ["Could not create the SQL review ticket. Try again shortly."],
  command_review_failed: ["SQL review could not be completed. Check the ticket status."],
  command_warning_confirmation_required: ["This SQL triggered a warning rule. Confirm the risk before running it."],
  unsupported_command_acl_action: [
    "This command policy requires the legacy workspace",
    "This version does not support the command policy. Ask an administrator to review it."
  ],
  unsupported_command_acl_regex_use_legacy_chen: [
    "This command policy requires the legacy workspace",
    "This version does not support the command rule regular expression. Contact an administrator."
  ],
  unsupported_database_credential_type: [
    "This credential type requires the legacy workspace",
    "This version does not support the database credential type. Use a compatible connection method."
  ],
  unsupported_database_for_go_v1: [
    "This service does not have the required database driver enabled. Check its build and configuration."
  ],
  unsupported_empty_command_acl: [
    "The command rule is incomplete and cannot be enforced safely. Contact an administrator.",
    "This command policy cannot be enforced; use the legacy workspace"
  ],
  unsupported_empty_command_acl_pattern: [
    "The command rule pattern is empty. Ask an administrator to correct it.",
    "This command policy cannot be enforced; use the legacy workspace"
  ],
  unsupported_empty_data_masking_pattern: [
    "The data masking pattern is empty. Ask an administrator to correct it.",
    "This masking policy cannot be enforced; use the legacy workspace"
  ],
  unsupported_empty_data_masking_rule: [
    "The data masking rule is incomplete. Ask an administrator to correct it.",
    "This masking policy cannot be enforced; use the legacy workspace"
  ],
  download_permission_denied: [
    "Result download is not permitted",
    "You do not have permission to download query results. Contact an administrator."
  ],
  upload_permission_denied: [
    "CSV import is not permitted",
    "You do not have permission to import CSV data. Contact an administrator."
  ],
  export_active: ["Cancel the active export first", "Cancel the active export first."],
  export_byte_limit: [
    "Export exceeds the 128 MiB data limit; narrow the query",
    "Export file exceeds the 128 MiB disk limit",
    "The export exceeds 128 MiB. Narrow the query or export smaller batches."
  ],
  export_canceled: ["Export canceled", "The export was canceled."],
  export_capacity: [
    "Four exports are already retained or running; remove a completed export or wait for expiry",
    "Four exports are retained or running. Remove completed exports or wait for expiry."
  ],
  export_cell_limit: [
    "An XLSX cell exceeds 32,767 characters. Use CSV to retain the full value.",
    "An XLSX cell exceeds 32,767 characters; choose CSV to retain the full value"
  ],
  export_column_limit: [
    "XLSX supports at most 16,384 columns. Use CSV instead.",
    "XLSX supports at most 16,384 columns; choose CSV"
  ],
  export_expired: ["Export file is unavailable", "The export file is no longer available. Create a new export."],
  export_failed: [
    "Export could not be completed",
    "The export failed. Check the query and details before retrying.",
    "Unable to create export"
  ],
  export_history_limit: ["Export history limit reached", "The export history limit was reached. Open a new session."],
  export_not_ready: ["Export is not ready or has expired", "The export is not ready or has expired. Check its status."],
  export_requires_single_select: [
    "Full export requires exactly one read query",
    "Full export requires exactly one read-only query. Adjust the SQL."
  ],
  export_result_limit: ["Only one result set can be exported", "Only one result set can be exported at a time."],
  export_row_limit: [
    "Export row limit reached; no partial file will be offered",
    "The export row limit was exceeded and no partial file was created. Narrow the query or export smaller batches.",
    "XLSX row limit reached; no partial workbook will be offered"
  ],
  export_storage_unavailable: [
    "Export storage is unavailable. Ask an administrator to check disk space and permissions.",
    "Private export storage could not be initialized",
    "Private export storage is unavailable"
  ],
  export_timeout: ["Export time limit exceeded", "The export timed out. Narrow the query and try again."],
  export_unavailable: [
    "Export file is unavailable",
    "Export is no longer available",
    "The export file is unavailable. Check its status or create a new export."
  ],
  invalid_export_format: ["Choose CSV or XLSX", "This export format is unsupported. Choose CSV or XLSX."],
  form_required: [
    "Native form download required",
    "The download request format is invalid. Download again from the export panel."
  ],
  invalid_ticket: ["Invalid download ticket", "The download ticket is invalid. Click Download again."],
  download_ticket_expired: [
    "Download ticket was used or expired",
    "The download ticket was used or expired. Click Download again."
  ],
  download_ticket_limit: ["Too many active download tickets", "Too many downloads were requested. Try again shortly."],
  download_unavailable: [
    "Download permissions or session state changed. The download cannot continue.",
    "Export permission or state changed"
  ],
  ai_busy: [
    "At most two AI tools can run per session",
    "At most two AI tools can run per session. Wait for existing tasks to finish."
  ],
  ai_unavailable: [
    "AI is unavailable for this session. Check managed mode and AI configuration.",
    "AI requires a managed session"
  ],
  duplicate_ai_request: [
    "AI request id is already active",
    "This AI request is already running. Wait for it to finish."
  ],
  invalid_ai_binding: ["Invalid AI resource binding", "The AI resource binding is invalid. Reconnect the session."],
  invalid_ai_frame: [
    "Invalid AI cancellation",
    "Invalid AI frame",
    "Invalid AI session binding",
    "Invalid JSON-RPC request",
    "Only tools/call with a string request id is supported",
    "The AI request format is invalid. Refresh the page and try again."
  ],
  invalid_source: ["This edit source is unsupported. Retry from the table data view.", "Unsupported edit source"],
  invalid_table: ["Select a table to browse", "Select a table to browse first."],
  invalid_changes: ["The changes are invalid. Check field values and the edit scope."],
  edit_unavailable: ["This result cannot be edited safely. Check the reason or refresh the table data."],
  edit_plan_expired: [
    "Preview was used or expired; refresh and create a new preview",
    "Refresh this result and create a new preview",
    "The edit preview was used or expired. Refresh the data and create a new preview."
  ],
  edit_plan_limit: [
    "The edit preview limit was reached. Wait for existing previews to expire.",
    "Too many edit previews; wait for existing previews to expire"
  ],
  edit_canceled: ["The save was canceled. Check transaction and data state."],
  edit_canceled_before_execution: [
    "Save was canceled before execution",
    "The save was canceled before any changes were executed."
  ],
  edit_canceled_rolled_back: [
    "Save was canceled and its changes were rolled back",
    "The save was canceled and its changes were rolled back."
  ],
  edit_session_changed_rolled_back: [
    "Session changed; this save was rolled back",
    "The session changed and this save was rolled back."
  ],
  edit_schema_changed: [
    "Table metadata changed; refresh and preview the changes again",
    "The table structure changed. Refresh the data and preview the changes again."
  ],
  edit_rollback_unknown: [
    "Rollback could not be confirmed. Reconnect and verify the data before repeating the save.",
    "Rollback could not be confirmed. Reconnect and verify the data before repeating this save"
  ],
  edit_commit_unknown: [
    "Commit was sent but not confirmed. Verify the data before repeating the save.",
    "Commit was sent but not confirmed. Verify the data before repeating this save"
  ],
  edit_conflict: [
    "A row changed or disappeared since it was loaded. This entire save was rolled back; refresh the table",
    "A row was changed or deleted by another operation. This entire save was rolled back. Refresh the table."
  ],
  edit_database_error: [
    "The database rejected a change. Field values are omitted from this diagnostic.",
    "The database rejected a change. No field values are included in this diagnostic."
  ],
  transaction_probe_failed: [
    "Cannot verify transaction state; reconnect before saving",
    "Could not verify transaction state. Reconnect before saving."
  ],
  transaction_failed: [
    "Roll back the failed transaction before saving",
    "The current transaction failed. Roll it back before saving."
  ],
  transaction_state_unknown: [
    "Transaction state is unknown or in manual-commit idle mode. Reconnect before saving.",
    "Transaction state is unknown or manual-commit idle; reconnect before saving"
  ],
  user_closed: ["The connection was closed."],
  command_review_sql_too_long: ["The SQL exceeds the review ticket length limit. Split it before requesting approval."],
  edit_other_console: ["Result does not belong to this console"],
  edit_result_changed: ["This result changed after saving; refresh it before editing again"],
  edit_refresh_required: ["Refresh this result before editing"],
  edit_settings_unavailable: ["Database settings are unavailable"],
  edit_simple_source_required: ["Only direct columns from one base table with a single primary key can be edited"],
  edit_context_unavailable: ["Database context is unavailable"],
  edit_context_changed: ["Switch back to this result's database or refresh the table before editing"],
  edit_unsupported_table: ["This table or its column types do not support safe editing"],
  edit_columns_changed: ["Result columns no longer match the table; refresh first"],
  edit_unknown_column_source: ["The source of every result column must be known"],
  edit_ambiguous_column_source: ["Result column source is ambiguous"],
  edit_ambiguous_columns: ["Result columns are ambiguous or no longer match the table"],
  edit_single_key_required: ["Editing requires exactly one primary-key column"],
  edit_key_missing: ["The result must contain the complete supported primary key"],
  edit_browse_unavailable: ["This table is unavailable for editable browsing; open it as a normal query"],
  edit_multiple_results: ["Multiple-result statements cannot be edited"],
  edit_masked_column: ["Masked columns cannot be edited"],
  edit_primary_key: ["Primary keys cannot be changed"],
  edit_generated_column: ["Generated columns are managed by the database"],
  edit_readonly_type: ["This column type is read-only"],
  edit_change_limit: ["A save must contain between 1 and 500 row changes"],
  edit_csv_browse_required: ["CSV import requires a table browse result"],
  edit_unknown_operation: ["Unknown row operation"],
  edit_browse_only: ["Only table browse results support adding or deleting rows"],
  edit_csv_insert_only: ["CSV import only appends new rows"],
  edit_row_invalid: ["A row reference is invalid or appears more than once"],
  edit_key_unavailable: ["A primary key value is unavailable"],
  edit_new_row_reference: ["New rows must not have an existing row reference"],
  edit_delete_values: ["Deleting a row does not accept new column values"],
  edit_empty_update: ["An update must change at least one column"],
  edit_column_invalid: ["A column index is invalid"],
  edit_writable_column_required: ["Provide at least one writable column for this database"],
  edit_batch_limit: ["The edit batch exceeds 2 MiB; save fewer changes"],
  value_null_forbidden: ["NULL is not allowed"],
  value_text_invalid: ["Value must be valid text without NUL"],
  value_boolean_invalid: ["Enter true, false, 1 or 0"],
  value_integer_invalid: ["Enter a whole number without separators"],
  value_number_invalid: ["Enter a valid number without separators"],
  value_json_invalid: ["Enter valid JSON"],
  column_readonly: ["Column “{name}” is read-only for this operation."],
  column_value_required: ["Column “{name}” requires a value."],
  column_error: ["Column “{name}”: {message}"],
  invalid_table_definition: ["Invalid table definition"],
  column_name_required: ["A column name is required"],
  select_column: ["Select a column"],
  column_rename_unchanged: ["Enter a different column name"],
  native_ddl_required: ["Use native DDL to preserve column attributes"],
  structure_unchanged: ["No structure changes to save"],
  select_supported_type: ["Select a supported type"],
  invalid_type_size: ["Invalid length or precision"],
  add_column_required: ["Add at least one column"],
  select_columns_required: ["Select at least one column"],
  index_unsupported: ["Index changes are not supported for this database type"],
  identifier_required: ["{label} is required."],
  identifier_control: ["{label} contains an unsupported control character."],
  identifier_table: ["Table name"],
  identifier_column: ["Column name"],
  identifier_index: ["Index name"],
  identifier_name: ["Name"],
  identifier_column_number: ["Column {index} name"],
  column_duplicate: ["Column name “{name}” is duplicated."],
  column_type_unsupported: ["Column “{name}” has an unsupported type."],
  column_size_invalid: ["Column “{name}” has an invalid length or precision."],
  index_method_unsupported: ["Index method “{name}” is not supported."],
  edit_source_complex: [
    "This query result cannot be edited directly. Use a simple query from one base table with its primary key and direct columns.",
    "query result is not editable",
    "query result is not editable: %s",
    "query result is not editable: a transactional base table is required",
    "query result is not editable: ambiguous projection",
    "query result is not editable: complex SELECT source",
    "query result is not editable: direct columns are required",
    "query result is not editable: empty projection",
    "query result is not editable: empty trailing projection",
    "query result is not editable: executable comment",
    "query result is not editable: generated column metadata is missing",
    "query result is not editable: incomplete column metadata",
    "query result is not editable: invalid TOP row limit",
    "query result is not editable: literal TOP row limit is required",
    "query result is not editable: mixed wildcard projection",
    "query result is not editable: multiple sources",
    "query result is not editable: multiple statements",
    "query result is not editable: one SELECT is required",
    "query result is not editable: one local table is required",
    "query result is not editable: primary key metadata is unavailable",
    "query result is not editable: projection expression",
    "query result is not editable: projection is missing",
    "query result is not editable: simple SELECT is required",
    "query result is not editable: subquery",
    "query result is not editable: table alias is missing",
    "query result is not editable: table source is missing",
    "query result is not editable: transactional grid editing is unavailable",
    "query result is not editable: unknown SQL mode",
    "query result is not editable: unknown projection owner",
    "query result is not editable: unsupported table source"
  ],
  unsupported_sql_dialect: ["unsupported SQL dialect"],
  sql_document_too_large: ["SQL document exceeds 2 MiB"],
  sql_proposal_expired: ["The SQL proposal is no longer available"],
  invalid_ai_context: ["The SQL editor context is invalid or changed. Select the query tab again and retry."],
  invalid_event: ["Invalid Chen event"],
  event_size_limit: ["Chen event exceeds the size limit"],
  metadata_access_unavailable: ["Metadata is unavailable for this account or server version"],
  metadata_incomplete: ["Unable to read complete metadata"],
  ddl_column_access: ["DDL requires table-level column access"],
  metadata_column_limit: ["Column preview exceeds the 200-column display limit"],
  ddl_access_unavailable: ["DDL is unavailable for this account or object"],
  ddl_unavailable: ["DDL is unavailable for this object"],
  ddl_type_unavailable: ["DDL object type is unavailable"],
  ddl_read_failed: ["Unable to read DDL"],
  ddl_invalid: ["DDL exceeds the display limit or cannot be decoded"],
  ddl_size_limit: ["DDL exceeds the 128 KiB display limit"],
  ddl_incomplete: ["Unable to read complete DDL"],
  ddl_too_large: ["DDL too large"],
  ddl_unsupported_value: ["Unsupported DDL value"]
};
