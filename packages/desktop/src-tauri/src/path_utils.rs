use std::path::PathBuf;

pub fn expand_tilde_path(value: &str) -> PathBuf {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return PathBuf::from(trimmed);
    }

    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));

    if trimmed == "~" {
        return home;
    }

    if trimmed.starts_with("~/") || trimmed.starts_with("~\\") {
        return home.join(&trimmed[2..]);
    }

    PathBuf::from(trimmed)
}
