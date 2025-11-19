In Tauri 2.9.0, the property path should be `infoPlist` (not `info`):

## Option 1: Custom Info.plist

Create `src-tauri/Info.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSAppSleepDisabled</key>
    <true/>
</dict>
</plist>
```

Then in `tauri.conf.json`:

```json
{
  "bundle": {
    "macOS": {
      "infoPlist": "./Info.plist"
    }
  }
}
```

## Option 2: Use Rust (more reliable)

Add to `src-tauri/Cargo.toml`:
```toml
[target.'cfg(target_os = "macos")'.dependencies]
cocoa = "0.25"
objc = "0.2"
```

In your `src-tauri/src/main.rs`:

```rust
#[cfg(target_os = "macos")]
fn disable_app_nap() {
    use cocoa::base::nil;
    use cocoa::foundation::NSString;
    use objc::{class, msg_send, sel, sel_impl};

    unsafe {
        let process_info: cocoa::base::id = msg_send![class!(NSProcessInfo), processInfo];
        let reason = NSString::alloc(nil).init_str("Keep app active");
        let _activity: cocoa::base::id = msg_send![
            process_info,
            beginActivityWithOptions: 0x00FFFFFF
            reason: reason
        ];
    }
}

fn main() {
    #[cfg(target_os = "macos")]
    disable_app_nap();

    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

The Rust approach is more reliable since it doesn't depend on config schema quirks.
