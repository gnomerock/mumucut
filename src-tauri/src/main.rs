// Release builds are a window app: without this Windows opens a terminal next to the window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    mumucut_lib::run()
}
