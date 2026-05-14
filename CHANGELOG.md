# Changelog

## [2.0.0] - 2026-05-15

### Added
- Profile system for skill management
- Skill registry with categories (global, code, lifeos, inbox)
- Project-local profile activation
- `spells profiles` command (list/show)
- `spells use` command for profile activation
- `spells materialize` command
- `spells skill add/new/list` commands
- `spells doctor` health check
- `spells config get/set` commands
- Service layer: ProfileService, SkillService, MaterializeService, ProjectService
- Unified error handling with SyncSpellsError classes
- Migration script from Bash version
- E2E integration tests

### Changed
- Extended Config type with profile-related fields (defaultProfile, profilesDir, activeDir)
- Service layer architecture (Command -> Service -> Lib pattern)
