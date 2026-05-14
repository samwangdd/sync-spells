#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNC_SPELLS_DIR="${SYNC_SPELLS_DIR:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/sync-spells}"

echo "SyncSpells Migration: Bash → Node CLI"
echo "======================================="
echo ""
echo "Source directory: $SYNC_SPELLS_DIR"
echo ""

# Check if source exists
if [ ! -d "$SYNC_SPELLS_DIR" ]; then
  echo "❌ Error: SyncSpells directory not found"
  echo "   Set SYNC_SPELLS_DIR environment variable if using custom path"
  exit 1
fi

# Migrate profiles/*.txt to profiles/*.json
PROFILES_DIR="$SYNC_SPELLS_DIR/profiles"

if [ -d "$PROFILES_DIR" ]; then
  echo "Migrating profiles..."

  for txt_file in "$PROFILES_DIR"/*.txt; do
    if [ -f "$txt_file" ]; then
      base_name=$(basename "$txt_file" .txt)
      json_file="$PROFILES_DIR/$base_name.json"

      echo "  Converting: $base_name.txt → $base_name.json"

      # Build JSON array of skill paths
      skills_json=""
      first=true
      while IFS= read -r skill_path; do
        if [ -n "$skill_path" ] && [[ ! "$skill_path" =~ ^# ]]; then
          if [ "$first" = true ]; then
            first=false
          else
            skills_json="$skills_json,"
          fi
          skills_json="${skills_json}\"${skill_path}\""
        fi
      done < "$txt_file"

      cat > "$json_file" << ENDOFFILE
{
  "name": "${base_name}",
  "skills": [${skills_json}]
}
ENDOFFILE

      echo "    ✓ Created: $json_file"
    fi
  done

  echo ""
  echo "✓ Profile migration complete"
  echo ""
  echo "Note: Original .txt files are preserved. Remove manually after verification."
else
  echo "⚠ No profiles directory found, skipping profile migration"
fi

echo ""
echo "Migration complete! Next steps:"
echo "  1. Review migrated profiles in: $PROFILES_DIR"
echo "  2. Run: spells setup"
echo "  3. Run: spells doctor"
echo ""
