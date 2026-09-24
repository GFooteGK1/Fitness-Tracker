# Approved staged deployment execution

Issue: Fitness-Tracker-i40.11. Owner: root. Target: existing SociusFit Vercel
project. Approved exact artifact: source93539b0, tar SHA256
461e0bf9e21561e0323c6c2edf53e825d48f8a8a8fc7c9f2a739798c8ea44814.
Scope includes prebuilt production staging with skip-domain and possible existing
WHOOP cron effects. No promotion, migration, pause/resume, athlete operations,
synthetic records, merge or paid resources. Prior preparation blockers resolved.

## Upload-container startup attempt 1

The pinned upload-only Node24/Vercel56.4.1 image built successfully before any
credential mount. A fresh container used no ports, read-only root, dropped
capabilities, bounded memory/swap, and only the exact official CLI global-config
directory mounted read-only outside its tmpfs upload directory. Startup failed:
`Error: crun: write: No space left on device: OCI runtime error`.

Container socius-stage-upload-93539b0 remains created, not running. Its image and
read-only mount identity were read back. No CLI login/read, artifact upload or
deployment occurred. First unresolved startup failure; no deployment attempts.
Next action is read-only disk/runtime capacity inspection before a changed remedy.

## Diagnosis and bounded corrected startup

Host and Linux disk, inodes and /run capacity are healthy. The failed container
reports `/root` tmpfs size16m with default `tmpcopyup`; the new image installed
284 npm packages and contains its image-owned npm cache. Installed Podman5.8.3
documentation explicitly supports `notmpcopyup`; upstream reports this exact
crun error when copying existing image files into an undersized tmpfs.

Three read-only `podman unshare` image-size probes failed before measurement:
inherited Windows cwd unavailable, Linux home cwd unavailable, then root-cwd
reexec temporary-file error. This diagnostic method is stopped; no size result
is claimed and no fourth unshare probe is authorized. These did not run the
upload container or CLI. The source of the image-size probe failures is unknown.

Changed startup hypothesis: mask the image-owned /root cache instead of copying
it into the16m tmpfs. One corrected container will keep the same image, mounts,
credentials boundary and all other settings, adding only `notmpcopyup` to /root.
This is startup attempt2, not a deployment retry. Preserve the first container.

## Corrected startup and deployment succeeded

Startup attempt2 succeeded with only /root notmpcopyup changed. Official CLI
login resolved the expected user. Exact tar and extracted files/symlinks passed
verification. Deployment attempt1 succeeded using prebuilt/prod/skip-domain;
Vercel reports READY for dpl_2tZqnshTDrFR5EDQpgi78dcBNns7. No rebuild occurred.

The first post-deployment metadata verifier incorrectly expected `teamId` on the
deployment response. Selected-field inspection showed the API uses `ownerId`
and `team.id`; both match the approved team. The read-only verifier was corrected
and passed without repeating deployment. All 31 production bindings are unchanged.
The custom domain and project production target remain old; the generated
project alias was automatically assigned to the new deployment.

Anonymous HTTP checks returned Vercel SSO redirects. Chrome requires Vercel login;
Greg was asked to sign in. Application rendering, hosted asset hashes/build ID,
and application-level unauthenticated 401 remain unverified. Independent review
found standard CLI curl may create a protection-bypass token; it was not used.
No bypass secret or protection setting was modified. This is an access boundary,
not an application test failure or reason to redeploy.

The completed upload container was stopped and read back as exited/running false;
the failed first container is created/running false. Both are preserved. The
three failed unshare diagnostics remain stopped, with no fourth attempt.
See the [staging receipt](../../docs/verification/programming-quality/production-staging-2026-09-23.md).
