use std::path::PathBuf;
use std::process::Command;

use crate::track::Track;

pub fn parse_mat_file(file_path: &str) -> Result<Vec<Track>, String> {
    let exe_path = find_converter()?;

    let output = Command::new(&exe_path)
        .arg(file_path)
        .output()
        .map_err(|e| format!("Failed to run converter: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Converter failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let tracks: Vec<Track> =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse converted JSON: {}", e))?;

    Ok(tracks)
}

fn find_converter() -> Result<String, String> {
    // 1. Bundled resource (production) — exe_dir/resources/convert_mat.exe
    let exe = std::env::current_exe().unwrap_or_default();
    let exe_dir = exe.parent().unwrap_or_else(|| std::path::Path::new("."));
    let resource_path = exe_dir.join("resources").join("convert_mat.exe");
    if resource_path.exists() {
        return Ok(resource_path.to_string_lossy().to_string());
    }

    // 2. Development: walk up from current dir to find src-tauri/resources/
    let mut dir = std::env::current_dir().unwrap_or_default();
    for _ in 0..4 {
        let dev_path = dir.join("src-tauri/resources/convert_mat.exe");
        if dev_path.exists() {
            return Ok(dev_path.to_string_lossy().to_string());
        }
        if let Some(parent) = dir.parent() {
            dir = parent.to_path_buf();
        }
    }

    // 3. Fallback: Python script (for developers with Python)
    let candidates = vec![
        PathBuf::from("scripts/convert_mat.py"),
        PathBuf::from("../scripts/convert_mat.py"),
    ];
    for path in &candidates {
        if path.exists() {
            return Ok(path.to_string_lossy().to_string());
        }
    }

    Err("convert_mat.exe not found. Build it with: pyinstaller --onefile scripts/convert_mat.py".to_string())
}
