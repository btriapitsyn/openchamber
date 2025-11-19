use std::path::PathBuf;

#[cfg(target_os = "macos")]
const PLATFORM_LOG_SEGMENTS: &[&str] = &["Library", "Logs", "OpenChamber"];
#[cfg(not(target_os = "macos"))]
const PLATFORM_LOG_SEGMENTS: &[&str] = &[".config", "openchamber", "logs"];

pub fn log_directory() -> Option<PathBuf> {
    let mut path = dirs::home_dir()?;
    for segment in PLATFORM_LOG_SEGMENTS {
        path.push(segment);
    }
    Some(path)
}

pub fn log_file_path() -> Option<PathBuf> {
    let mut dir = log_directory()?;
    dir.push("desktop.log");
    Some(dir)
}
