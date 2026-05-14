# BIS Documentation

This folder contains generated and maintained documentation for the Barangay Information System (BIS).

## Files

- `SOURCE_CODE_INDEX.md`:
  High-level architecture, module map, API map, and frontend route map.
- `SOURCE_CODE_FULL_GENERATED.md`:
  Generated full source reference (all selected source files concatenated into one markdown document).
- `generate_source_documentation.ps1`:
  PowerShell script that regenerates `SOURCE_CODE_FULL_GENERATED.md`.

## Regenerate full source documentation

Run from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\docs\generate_source_documentation.ps1
```

Notes:
- The generator excludes build artifacts and dependency folders.
- The generator includes backend, frontend source, cloud functions, and root configuration files.
