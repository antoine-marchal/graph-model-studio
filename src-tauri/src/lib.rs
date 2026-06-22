use std::sync::Mutex;
use tauri::State;

/// File handed to the app on launch, either as a CLI argument
/// (`graph-model-studio.exe model.gmc`) or via a file-association
/// double-click. Holds (path, content).
struct CliFile(Mutex<Option<(String, String)>>);

#[tauri::command]
fn get_cli_file(state: State<CliFile>) -> Option<(String, String)> {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_binary_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

fn read_launch_file() -> Option<(String, String)> {
    // args[0] is the executable; the first real arg is the file path.
    for arg in std::env::args().skip(1) {
        if arg.starts_with('-') {
            continue
        }
        if let Ok(content) = std::fs::read_to_string(&arg) {
            return Some((arg, content))
        }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(CliFile(Mutex::new(read_launch_file())))
        .invoke_handler(tauri::generate_handler![
            get_cli_file,
            read_text_file,
            write_text_file,
            write_binary_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Graph Model Studio");
}
