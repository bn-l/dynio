<think>The user wants to undo their most recent commit without losing the work in it.

Options:
- `git reset --soft HEAD~1` moves the branch back one commit and keeps the changes staged.
- `git reset HEAD~1` (the default, `--mixed`) keeps them too, but unstaged.
- `git reset --hard HEAD~1` would throw the changes away, so not that one.

If the commit has already been pushed, rewriting history causes trouble for anyone who pulled it, so `git revert` is safer there.

search(git reset soft vs mixed keep changes)
Title: Git - git-reset Documentation
URL: https://git-scm.com/docs/git-reset
Content: --soft Does not touch the index file or the working tree at all.
</think>
Use a **soft reset**:

```bash
git reset --soft HEAD~1
```

This moves your branch back one commit and keeps everything from it **staged**, ready to commit again.

- **Want the changes unstaged?** Use `git reset HEAD~1` (the default `--mixed` mode).
- **Already pushed?** Use `git revert HEAD` instead. It adds a new commit that undoes the last one, so you don't rewrite history that others may have pulled.

**Sources**
- [git-reset documentation](https://git-scm.com/docs/git-reset)
- [git-revert documentation](https://git-scm.com/docs/git-revert)
