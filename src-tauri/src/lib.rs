use std::sync::Mutex;
use serde::Serialize;
use tauri::{Manager, State};

/// File handed to the app on launch, either as a CLI argument
/// (`graph-model-studio.exe model.gmc`) or via a file-association
/// double-click. Holds (path, content).
struct CliFile(Mutex<Option<(String, String)>>);

/// Headless export request parsed from `--export` CLI flags.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportRequest {
    input_content: String,
    input_name: String,
    output: String,
    format: String,
    width: Option<u32>,
    height: Option<u32>,
    theme: Option<String>,
    view: Option<String>,
}
struct ExportState(Option<ExportRequest>);

#[tauri::command]
fn get_cli_file(state: State<CliFile>) -> Option<(String, String)> {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
fn get_export_request(state: State<ExportState>) -> Option<ExportRequest> {
    state.0.clone()
}

/// Called by the frontend when a headless export finishes; prints the result
/// and terminates the process with the matching exit code.
#[tauri::command]
fn finish_export(success: bool, message: String) {
    if success {
        println!("{message}");
        std::process::exit(0);
    } else {
        eprintln!("{message}");
        std::process::exit(1);
    }
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

fn base_name(p: &str) -> String {
    p.rsplit(|c| c == '/' || c == '\\').next().unwrap_or(p).to_string()
}

fn format_from_output(out: &str) -> Option<&'static str> {
    let ext = out.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "png" => Some("png"),
        "json" => Some("json"),
        "gmc" | "dsl" => Some("gmc"),
        "md" | "mmd" | "mermaid" => Some("mermaid"),
        "puml" | "plantuml" => Some("plantuml"),
        _ => None,
    }
}

/// Parse `--export` flags. Exits the process with usage on malformed input.
fn parse_export() -> Option<ExportRequest> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let list_views = args.iter().any(|a| a == "--list-views");
    if !list_views && !args.iter().any(|a| a == "--export") {
        return None
    }

    let mut input: Option<String> = None;
    let mut output: Option<String> = None;
    let mut format: Option<String> = None;
    let mut width: Option<u32> = None;
    let mut height: Option<u32> = None;
    let mut theme: Option<String> = None;
    let mut view: Option<String> = None;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--export" | "--list-views" => {}
            "--input" | "-i" => { i += 1; input = args.get(i).cloned(); }
            "--out" | "--output" | "-o" => { i += 1; output = args.get(i).cloned(); }
            "--format" | "-f" => { i += 1; format = args.get(i).cloned(); }
            "--width" | "-w" => { i += 1; width = args.get(i).and_then(|v| v.parse().ok()); }
            "--height" => { i += 1; height = args.get(i).and_then(|v| v.parse().ok()); }
            "--theme" | "-t" => { i += 1; theme = args.get(i).cloned(); }
            "--view" | "-v" => { i += 1; view = args.get(i).cloned(); }
            other if !other.starts_with('-') && input.is_none() => input = Some(other.to_string()),
            _ => {}
        }
        i += 1;
    }

    let usage = "Usage: graph-model-studio --export --input <file.gmc|.json> --out <file.png|.json|.gmc|.md|.puml> [--format <fmt>] [--view <name>] [--width N] [--height N] [--theme dark|light]\n       graph-model-studio --list-views --input <file.gmc|.json>";
    let input = input.unwrap_or_else(|| { eprintln!("missing --input\n{usage}"); std::process::exit(2) });
    let input_content = std::fs::read_to_string(&input)
        .unwrap_or_else(|e| { eprintln!("cannot read '{input}': {e}"); std::process::exit(2) });

    // --list-views: no output/format required, the frontend just prints view ids/names
    if list_views {
        return Some(ExportRequest {
            input_content, input_name: base_name(&input),
            output: String::new(), format: "list-views".into(),
            width: None, height: None, theme: None, view: None,
        })
    }

    let output = output.unwrap_or_else(|| { eprintln!("--export: missing --out\n{usage}"); std::process::exit(2) });
    let format = format.or_else(|| format_from_output(&output).map(String::from))
        .unwrap_or_else(|| { eprintln!("--export: cannot infer format from '{output}'; pass --format\n{usage}"); std::process::exit(2) });

    Some(ExportRequest {
        input_content,
        input_name: base_name(&input),
        output,
        format,
        width,
        height,
        theme,
        view,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let export = parse_export();
    let is_export = export.is_some();
    // in export mode we never treat args as a file to open
    let cli_file = if is_export { None } else { read_launch_file() };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(CliFile(Mutex::new(cli_file)))
        .manage(ExportState(export))
        .invoke_handler(tauri::generate_handler![
            get_cli_file,
            get_export_request,
            finish_export,
            read_text_file,
            write_text_file,
            write_binary_file
        ])
        .setup(move |app| {
            // headless export: keep the window off-screen / hidden
            if is_export {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Graph Model Studio");
}
