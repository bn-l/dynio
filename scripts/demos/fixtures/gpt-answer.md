Use a **soft reset**:

```bash
git reset --soft HEAD~1
```

This moves your branch back one commit and keeps everything from it **staged**, ready to commit again.

- **Want the changes unstaged?** Use `git reset HEAD~1` (the default `--mixed` mode).
- **Only need to fix the commit?** Stage the fix and run `git commit --amend` instead.
- **Already pushed?** Use `git revert HEAD`. It adds a new commit that undoes the last one, so you don't rewrite history that others may have pulled.
