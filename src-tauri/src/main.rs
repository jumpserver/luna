#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if jumpserver_client_lib::run_ssh_helper_if_requested() {
        return;
    }
    jumpserver_client_lib::run();
}
