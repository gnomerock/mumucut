fn main() {
    tauri_build::build();
    // Windows test executables need the Common-Controls v6 manifest (the app binary gets its own from tauri-build).
    #[cfg(windows)]
    {
        let m = std::path::Path::new(&std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("test-manifest.xml");
        println!("cargo:rerun-if-changed=test-manifest.xml");
        println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg-tests=/MANIFESTINPUT:{}", m.display());
    }
}
