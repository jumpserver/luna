use tauri::command;

#[command]
pub fn list_system_fonts() -> Vec<String> {
    let source = font_kit::source::SystemSource::new();

    match source.all_families() {
        Ok(mut families) => {
            families.sort_unstable();
            families.dedup();
            families
        }
        Err(_) => Vec::new(),
    }
}
