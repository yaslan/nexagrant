# Shared by githooks/pre-commit and githooks/pre-push (FO-114).
# POSIX sh, sourced, not run.
#
# core.bare lives in the SHARED .git/config. When it flips to true the main
# checkout stops working ("fatal: this operation must be run in a work tree")
# while linked worktrees keep committing, so nobody notices until an agent's
# commit or report step dies there. Known writer: a `git init` that inherits a
# linked worktree's GIT_DIR (FO-111). The guard only reports: flipping the
# setting back silently would hide whatever wrote it.

# Exit status 1 and a fix-it message on stderr when core.bare=true. $1 names
# the caller in the message.
core_bare_guard() {
  [ "$(git config --get core.bare 2>/dev/null)" = "true" ] || return 0
  _cfg="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)/config"
  {
    echo
    echo "✗ $1: paylaşılan git yapılandırmasında core.bare=true ($_cfg)."
    echo "  Ana checkout bu durumda çalışmaz (\"must be run in a work tree\"); bu kanca devam etmiyor."
    echo "  Kontrol:   git config --file \"$_cfg\" --get core.bare"
    echo "  Düzeltme:  git config --file \"$_cfg\" core.bare false"
    echo "  Sonra kim yazdığını bul: GIT_DIR set iken başka dizinde git init/config koşan"
    echo "  bir kanca, betik ya da test (docs/RELEASE_CHECKLIST.md §9.1)."
  } >&2
  return 1
}
